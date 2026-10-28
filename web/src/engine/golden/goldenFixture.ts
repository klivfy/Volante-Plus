import { Lottery } from '../../types/domain';
import { classifyHits, hasTrevos, lotteryRules, prizeTiers } from '../prizeRules';

/**
 * Fixtures douradas de paridade web–Kotlin (Fase 4 do plano de
 * confiabilidade, frente 1).
 *
 * O que este módulo produz NÃO é um snapshot do motor: é a **verdade
 * matemática canônica** que as duas implementações (TypeScript e o motor
 * compartilhado Kotlin Multiplatform) têm de reproduzir, cada uma a seu
 * modo, no mesmo commit. A diferença para um snapshot de teste importa:
 *
 * - Frações **exatas** (numerador/denominador como inteiros, reduzidas por
 *   mdc) são a forma canônica de um racional — a comparação entre as
 *   plataformas é literalmente byte a byte, sem ponto flutuante no meio.
 * - As grades de classificação (acertos → faixa) são inteiros — comparação
 *   exata.
 * - Valores em ponto flutuante NÃO entram na fixture: os algoritmos das duas
 *   plataformas são deliberadamente diferentes (`logFactorial` acumulado
 *   aqui, Lanczos `lnGamma` lá), então seus últimos bits não têm por que
 *   coincidir. O que as duas verificam, cada uma com o seu double, é a
 *   distância até a fração exata da fixture (tolerância relativa declarada).
 *
 * Entradas canônicas (apostas e concursos de teste) são FIXADAS aqui —
 * sintéticas, declaradas como tais, sem relação com o histórico oficial.
 * Assim a paridade não depende de rede nem de versão do seed.
 *
 * O gerador é `scripts/generate-golden-fixtures.mjs` (esbuild), que grava os
 * JSON em `shared/src/commonTest/resources/golden/` — fonte única lida pelo
 * teste dourado Kotlin (`GoldenParityTest.kt`) e pelo teste anti-deriva da
 * web (`goldenFixtures.test.ts`), que re-gera e exige igualdade byte a byte
 * com os arquivos versionados. Se um deles mudou sem o outro, ou a fixture
 * saiu do motor, ou o motor mudou de verdade — qualquer um dos dois casos
 * precisa de revisão humana, nunca de um `update snapshot` automático.
 */

/** Versão do schema das fixtures — mudou, os dois lados mudam juntos. */
export const GOLDEN_FIXTURE_SCHEMA = 'volante-plus/golden-parity@1';

/**
 * Tolerância relativa com que cada motor verifica o seu double contra a
 * fração exata. A mesma da recomputação independente dos exatos
 * (`calibration/auditExact.ts`): 1e-9 relativo é frouxo para o erro real
 * (~1e-15 por construção) e apertado o bastante para pegar qualquer troca
 * de fórmula ou inversão de faixa.
 */
export const FLOAT_VS_EXACT_TOLERANCE = 1e-9;

/** Fração exata reduzida — a forma canônica de um racional nestas fixtures. */
export interface ExactFraction {
  numerator: string;
  denominator: string;
}

export interface GoldenRules {
  numberUniverse: number;
  numbersDrawn: number;
  numbersPerBet: number;
  trevoUniverse: number;
  trevosDrawn: number;
  trevosPerBet: number;
  minSelection: number;
  maxSelection: number;
  betPriceBrl: number;
}

export interface GoldenTier {
  key: string;
  numberHits: number;
  /** `null` em loterias sem trevo — o JSON não carrega `undefined`. */
  trevoHits: number | null;
}

export interface GoldenClassification {
  numberHits: number;
  trevoHits: number;
  /** Chave da faixa premiada, ou `null` quando a combinação não paga. */
  tier: string | null;
}

export interface GoldenBetOutcome {
  betIndex: number;
  drawIndex: number;
  numberHits: number;
  trevoHits: number;
  tier: string | null;
  prized: boolean;
}

export interface GoldenClosureCase {
  /** Dezenas do pool, ordenadas — entrada canônica das duas plataformas. */
  pool: number[];
  gameSize: number;
  guarantee: number;
  /** C(v, t): quantos subconjuntos a garantia obriga a cobrir. */
  totalSubsets: number;
}

export interface GoldenFixture {
  schema: string;
  lottery: string;
  rules: GoldenRules;
  tiers: GoldenTier[];
  classification: GoldenClassification[];
  /** Probabilidade exata por faixa: C(K,k)·C(N−K,n−k)[·trevo] / C(N,n)·C(T,t). */
  exactTierProbabilities: Array<{ tier: string } & ExactFraction>;
  /** Σ faixas — soma das frações acima, reduzida uma única vez no fim. */
  exactPrizeProbability: ExactFraction;
  /** E[acertos] = K·n/N, exato. */
  exactExpectedNumberHits: ExactFraction;
  /** Apostas canônicas (sintéticas, fixadas). */
  canonicalBets: number[][];
  /** Trevos de cada aposta canônica (só +Milionária; lista vazia fora dela). */
  canonicalBetsTrevos: number[][];
  /** Concursos canônicos (sintéticos, fixados). */
  canonicalDraws: Array<{ contestNumber: number; numbers: number[]; trevos: number[] }>;
  /** Resultado de cada par (aposta, concurso) sob as regras da modalidade. */
  betOutcomes: GoldenBetOutcome[];
  /** Invariantes de fechamento que as DUAS plataformas verificam por exaustão. */
  closureCases: GoldenClosureCase[];
  /** Garantias oferecidas pela modalidade (dois motores devem concordar). */
  offeredGuarantees: number[];
}

/** C(n, k) exato — divisão passo a passo, cada prefixo é binomial inteiro. */
export function bigBinomial(n: number, k: number): bigint {
  if (k < 0 || n < 0 || k > n) return BigInt(0);
  let result = BigInt(1);
  for (let i = 1; i <= k; i++) {
    result = (result * BigInt(n - k + i)) / BigInt(i);
  }
  return result;
}

/** mdc de BigInt por Euclides — para reduzir a fração à forma canônica. */
function bigGcd(a: bigint, b: bigint): bigint {
  let x = a < BigInt(0) ? -a : a;
  let y = b < BigInt(0) ? -b : b;
  while (y > BigInt(0)) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/** Reduz num/den à forma canônica (den > 0). Fração nula vira 0/1. */
export function reduceFraction(num: bigint, den: bigint): ExactFraction {
  if (num === BigInt(0)) return { numerator: '0', denominator: '1' };
  const g = bigGcd(num, den);
  const sign = den < BigInt(0) ? BigInt(-1) : BigInt(1);
  return { numerator: ((num / g) * sign).toString(), denominator: ((den / g) * sign).toString() };
}

/**
 * Fração exata do modelo hipergeométrico de dezenas:
 * num = C(K, k)·C(N−K, n−k), den = C(N, n).
 */
function exactNumberRatio(
  N: number,
  K: number,
  n: number,
  k: number,
): { num: bigint; den: bigint } {
  return {
    num: bigBinomial(K, k) * bigBinomial(N - K, n - k),
    den: bigBinomial(N, n),
  };
}

/** Fração exata dos trevos: C(2,t)·C(4,2−t) / C(6,2). */
function exactTrevoRatio(hits: number): { num: bigint; den: bigint } {
  return exactNumberRatio(6, 2, 2, hits);
}

/** Soma de frações exatas (denominadores positivos), sem reduzir no meio. */
function sumFractions(parts: Array<{ num: bigint; den: bigint }>): ExactFraction {
  let num = BigInt(0);
  let den = BigInt(1);
  for (const part of parts) {
    num = num * part.den + part.num * den;
    den = den * part.den;
  }
  return reduceFraction(num, den);
}

/**
 * Concursos e apostas canônicas por modalidade — sintéticos e FIXADOS.
 * Nada aqui vem do histórico oficial: são entradas de teste, e a fixture
 * declara isso para não virar "dado da Caixa" por acidente.
 */
const CANONICAL_INPUTS: Record<
  string,
  { bets: number[][]; betsTrevos: number[][]; draws: Array<[number, number[], number[]]> }
> = {
  megasena: {
    bets: [
      [1, 2, 3, 4, 5, 6],
      [4, 8, 15, 16, 23, 42],
      [10, 20, 30, 40, 50, 60],
    ],
    betsTrevos: [],
    draws: [
      [1001, [4, 8, 15, 16, 23, 42], []],
      [1002, [1, 2, 11, 22, 33, 44], []],
      [1003, [6, 16, 26, 36, 46, 60], []],
    ],
  },
  maismilionaria: {
    bets: [
      [1, 2, 3, 4, 5, 6],
      [7, 13, 21, 33, 44, 49],
      [5, 10, 15, 25, 35, 50],
    ],
    betsTrevos: [
      [1, 2],
      [3, 6],
      [2, 5],
    ],
    draws: [
      [2001, [1, 2, 3, 4, 5, 6], [1, 2]],
      [2002, [7, 13, 21, 33, 44, 49], [3, 6]],
      [2003, [9, 18, 27, 36, 45, 50], [2, 5]],
    ],
  },
  quina: {
    bets: [
      [5, 20, 33, 61, 80],
      [1, 2, 3, 4, 5],
      [10, 30, 50, 70, 80],
    ],
    betsTrevos: [],
    draws: [
      [3001, [5, 20, 33, 61, 80], []],
      [3002, [1, 2, 44, 55, 66], []],
      [3003, [10, 25, 50, 70, 79], []],
    ],
  },
};

/** Pool canônico de fechamento: 10 dezenas — as duas plataformas cobrem C(v,6,3) e C(v,6,4). */
const CLOSURE_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Identificador estável da modalidade no nome de arquivo e no JSON. */
export function goldenLotteryKey(lottery: Lottery): string {
  switch (lottery) {
    case Lottery.MEGA_SENA:
      return 'megasena';
    case Lottery.MAIS_MILIONARIA:
      return 'maismilionaria';
    case Lottery.QUINA:
      return 'quina';
  }
}

export const GOLDEN_LOTTERIES: readonly Lottery[] = [
  Lottery.MEGA_SENA,
  Lottery.MAIS_MILIONARIA,
  Lottery.QUINA,
];

/** C(v, t) como número — tamanhos cabem em double com folga (C(10,4)=210). */
export function subsetCount(v: number, t: number): number {
  return Number(bigBinomial(v, t));
}

/**
 * Monta a fixture dourada completa da modalidade. Determinística: mesma
 * entrada, mesmos bytes (o gerador grava `JSON.stringify(fixture, null, 2)`).
 */
export function buildGoldenFixture(lottery: Lottery): GoldenFixture {
  const rules = lotteryRules(lottery);
  const key = goldenLotteryKey(lottery);
  const inputs = CANONICAL_INPUTS[key];
  if (!inputs) throw new RangeError(`Sem entradas canônicas para ${key}`);

  const goldenRules: GoldenRules = {
    numberUniverse: rules.numberUniverse,
    numbersDrawn: rules.numbersDrawn,
    numbersPerBet: rules.numbersPerBet,
    trevoUniverse: rules.trevoUniverse,
    trevosDrawn: rules.trevosDrawn,
    trevosPerBet: rules.trevosPerBet,
    minSelection: rules.minSelection,
    maxSelection: rules.maxSelection,
    betPriceBrl: rules.betPriceBrl,
  };

  const tiers: GoldenTier[] = prizeTiers(lottery).map((tier) => ({
    key: tier.key,
    numberHits: tier.numberHits,
    trevoHits: tier.trevoHits ?? null,
  }));

  // Grade de classificação: todas as combinações de acertos possíveis.
  const trevoHitsValues = hasTrevos(lottery) ? [0, 1, 2] : [0];
  const classification: GoldenClassification[] = [];
  for (let numberHits = 0; numberHits <= rules.numbersPerBet; numberHits++) {
    for (const trevoHits of trevoHitsValues) {
      const tier = classifyHits(lottery, numberHits, trevoHits);
      classification.push({
        numberHits,
        trevoHits,
        tier: tier ? tier.key : null,
      });
    }
  }

  // Frações exatas por faixa. Faixa com trevo: produto das duas hipergeométricas.
  const exactTierProbabilities = tiers.map((tier) => {
    const numbers = exactNumberRatio(
      rules.numberUniverse,
      rules.numbersDrawn,
      rules.numbersPerBet,
      tier.numberHits,
    );
    if (tier.trevoHits === null) {
      const reduced = reduceFraction(numbers.num, numbers.den);
      return { tier: tier.key, ...reduced };
    }
    const trevos = exactTrevoRatio(tier.trevoHits);
    const reduced = reduceFraction(numbers.num * trevos.num, numbers.den * trevos.den);
    return { tier: tier.key, ...reduced };
  });

  const exactPrizeProbability = sumFractions(
    tiers.map((tier) => {
      const numbers = exactNumberRatio(
        rules.numberUniverse,
        rules.numbersDrawn,
        rules.numbersPerBet,
        tier.numberHits,
      );
      if (tier.trevoHits === null) return numbers;
      const trevos = exactTrevoRatio(tier.trevoHits);
      return { num: numbers.num * trevos.num, den: numbers.den * trevos.den };
    }),
  );

  const exactExpectedNumberHits = reduceFraction(
    BigInt(rules.numbersDrawn * rules.numbersPerBet),
    BigInt(rules.numberUniverse),
  );

  const canonicalBets = inputs.bets.map((bet) => [...bet]);
  const canonicalBetsTrevos = inputs.betsTrevos.map((t) => [...t]);

  const canonicalDraws = inputs.draws.map(([contestNumber, numbers, trevos]) => ({
    contestNumber,
    numbers: [...numbers].sort((a, b) => a - b),
    trevos: [...trevos].sort((a, b) => a - b),
  }));

  const betOutcomes: GoldenBetOutcome[] = [];
  for (let betIndex = 0; betIndex < canonicalBets.length; betIndex++) {
    for (let drawIndex = 0; drawIndex < canonicalDraws.length; drawIndex++) {
      const bet = canonicalBets[betIndex];
      const draw = canonicalDraws[drawIndex];
      const numberHits = bet.filter((n) => draw.numbers.includes(n)).length;
      const trevoHits = hasTrevos(lottery)
        ? canonicalBetsTrevos[betIndex].filter((t) => draw.trevos.includes(t)).length
        : 0;
      const tier = classifyHits(lottery, numberHits, trevoHits);
      betOutcomes.push({
        betIndex,
        drawIndex,
        numberHits,
        trevoHits,
        tier: tier ? tier.key : null,
        prized: tier !== null,
      });
    }
  }

  // Fechamento: as duas plataformas usam tabelas de covering designs
  // DIFERENTES por decisão de projeto (a web busca por recozimento, o Kotlin
  // embute designs próprios) — o que tem de coincidir é o INVARIANTE: um
  // design verificado por exaustão cobre exatamente C(v, t) subconjuntos e
  // custa jogos × preço da modalidade. O caso usa pool de 10 dezenas, onde
  // as duas plataformas oferecem terno e quadra.
  //
  // Assimetria DECLARADA (não é divergência): os designs Kotlin são
  // C(v, 6, t) — jogos de 6 dezenas — e a UI Kotlin oferece fechamento só
  // para a Mega-Sena. A Quina (aposta de 5 dezenas) fica SEM caso de
  // fechamento na fixture; a web a resolve por busca gulosa e o Kotlin
  // declara a lacuna na UI (guard no VolanteViewModel). A lista vazia é a
  // declaração — o teste dourado falha se alguém prometer fechamento de
  // Quina num dos lados sem rever os dois.
  const closureCases: GoldenClosureCase[] =
    rules.numbersPerBet === 6
      ? [3, 4].map((guarantee) => ({
          pool: [...CLOSURE_POOL],
          gameSize: 6,
          guarantee,
          totalSubsets: subsetCount(CLOSURE_POOL.length, guarantee),
        }))
      : [];

  const offered = [3, 4].filter(
    (t) =>
      t < rules.numbersPerBet &&
      (classifyHits(lottery, t, 0) !== null || classifyHits(lottery, t, 1) !== null),
  );

  return {
    schema: GOLDEN_FIXTURE_SCHEMA,
    lottery: key,
    rules: goldenRules,
    tiers,
    classification,
    exactTierProbabilities,
    exactPrizeProbability,
    exactExpectedNumberHits,
    canonicalBets,
    canonicalBetsTrevos,
    canonicalDraws,
    betOutcomes,
    closureCases,
    offeredGuarantees: offered,
  };
}

/**
 * Serialização estável da fixture: 2 espaços, ordem de inserção, quebra
 * final. É ESTA forma que os três consumidores esperam (gerador, teste
 * anti-deriva da web, teste dourado Kotlin).
 */
export function serializeGoldenFixture(fixture: GoldenFixture): string {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

/**
 * Distância relativa entre o double do motor e a fração exata — a asserção
 * que cada plataforma faz contra a própria fixture (1e-9, ver constante).
 */
export function relativeDeviation(exact: number, value: number): number {
  if (exact === 0) return Math.abs(value);
  return Math.abs(value - exact) / Math.abs(exact);
}
