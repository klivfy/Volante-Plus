import { GameBatch, Lottery } from '../types/domain';
import { binomial } from './hypergeometric';
import { hasTrevos, lotteryRules } from './prizeRules';
import { createSeededRandom, RandomSource } from './random';
import { unpopularityPenalty } from './unpopularity';

/**
 * A única alavanca que a matemática deixa de pé numa loteria — e a sua
 * medida exata.
 *
 * ## O argumento, em três passos
 *
 * **1. A chance de acertar é intocável.** `E[acertos] = K·n/N` não depende de
 * quais dezenas foram marcadas (distribuição hipergeométrica — ver
 * `hypergeometric.ts`). Duas apostas simples quaisquer — a mais "quente" e a
 * mais "fria" — têm *exatamente* a mesma probabilidade de cair em cada faixa.
 * Nenhum algoritmo, histórico ou padrão altera isso, porque sorteios são
 * independentes. Este módulo não tenta e não pode mexer aqui.
 *
 * **2. O retorno esperado incondicional também é intocável.** A fração da
 * arrecadação que vira prêmio é fixada em norma, antes de qualquer sorteio.
 * O teto é o mesmo para todo mundo.
 *
 * **3. Sobra exatamente uma coisa.** O prêmio das faixas de rateio é um
 * *bolo dividido entre os acertadores*. Se você acerta sozinho, leva o bolo;
 * se acerta junto com outros nove, leva um décimo. E **com quantas pessoas
 * você divide depende das dezenas que você marcou**, porque as pessoas não
 * escolhem ao acaso (`unpopularity.ts` documenta os vieses medidos). Logo:
 *
 * > Entre duas apostas com a mesma probabilidade de ganhar — e todas têm —
 * > a menos popular tem maior valor esperado **condicional a ganhar**.
 * > A escolha é de graça: não custa nada e não reduz chance nenhuma.
 *
 * ## A fórmula
 * Seja `q` a probabilidade de **outro** apostador marcar exatamente a sua
 * combinação e `N` o número de apostas do concurso. Os demais acertadores da
 * sua combinação são `K ~ Binomial(N−1, q)`, e você recebe `bolo / (1+K)`:
 *
 *     E[1/(1+K)] = (1 − (1−q)^N) / (N·q)  ≡  crowdingFactor(q, N)
 *
 * `crowdingFactor` vale 1 quando ninguém mais joga a sua combinação e cai
 * conforme ela fica popular. O ganho de escolher uma combinação com
 * popularidade relativa `m` em vez da média é exatamente
 *
 *     ganho = crowdingFactor(m·q₀, N) / crowdingFactor(q₀, N) − 1,   q₀ = 1/C
 *
 * com `C` = número de combinações distintas.
 *
 * ## O que é medido e o que é heurístico
 * - `crowdingFactor`, `q₀`, `C`, o efeito sobre o rateio: **exatos**,
 *   derivados acima e verificáveis por simulação.
 * - `m`, a popularidade relativa de uma combinação concreta: **heurístico**.
 *   Vem de `unpopularityPenalty`, cuja direção a literatura sustenta mas cuja
 *   magnitude no Brasil ninguém pode calibrar — a Caixa não publica a
 *   distribuição de dezenas apostadas. Ver `POPULARITY_ELASTICITY`.
 *
 * Porta direta do `PayoutShare.kt` do app Android.
 */

/**
 * Quanto a popularidade responde a um desvio-padrão de `unpopularityPenalty`.
 *
 * `m = exp(β · z)`, com `z` o escore padronizado da penalidade. Com
 * β = 0,35 uma combinação um desvio acima da média é disputada por 1,42×
 * mais gente, e uma um desvio abaixo, por 0,70×.
 *
 * WHY deste valor: é deliberadamente conservador. O efeito isolado mais
 * forte da literatura (preferência por datas, 21,0% contra 13,3% esperados
 * no Dutch Lotto — ver `unpopularity.ts`) implica razão ~1,6 para uma única
 * característica; β = 0,35 fica abaixo disso para a combinação inteira.
 * Preferimos subestimar o ganho a vendê-lo.
 */
export const POPULARITY_ELASTICITY = 0.35;

/**
 * Fator de diluição: valor esperado de `1/(1+K)` com `K ~ Bin(N−1, q)`, ou
 * seja, a fração do bolo que sobra para você ao dividi-lo com quem marcou a
 * mesma combinação. Vale 1,0 quando você acerta sozinho.
 */
export function crowdingFactor(selectionProbability: number, tickets: number): number {
  if (selectionProbability < 0 || selectionProbability > 1) {
    throw new RangeError(`Probabilidade de seleção inválida: ${selectionProbability}`);
  }
  if (tickets < 1) {
    throw new RangeError(`Número de apostas inválido: ${tickets}`);
  }
  if (selectionProbability <= 0) return 1;
  const expected = tickets * selectionProbability;
  // (1 − (1−q)^N)/(N·q), estável para q ~ 1e-8 e N ~ 1e7.
  return -Math.expm1(tickets * Math.log1p(-selectionProbability)) / expected;
}

/** Quantidade de apostas simples distintas da loteria. */
export function distinctSimpleBets(lottery: Lottery): number {
  const rules = lotteryRules(lottery);
  const numbers = binomial(rules.numberUniverse, rules.numbersPerBet);
  const trevos = hasTrevos(lottery) ? binomial(rules.trevoUniverse, rules.trevosPerBet) : 1;
  return numbers * trevos;
}

/** Probabilidade de uma aposta uniforme cair numa combinação específica. */
export function uniformSelectionProbability(lottery: Lottery): number {
  return 1 / distinctSimpleBets(lottery);
}

/**
 * Média e desvio-padrão amostral de `unpopularityPenalty` sobre combinações
 * uniformes — a régua que converte um escore bruto em posição relativa.
 *
 * WHY (determinístico): os momentos vêm de uma varredura de Monte Carlo com
 * semente fixa, calculada uma vez por loteria e memorizada. Semente fixa
 * porque a régua precisa ser a mesma em toda execução: se ela variasse, dois
 * relatórios do mesmo jogo dariam números diferentes e a medida deixaria de
 * ser auditável. Mesma semente e mesma contagem de amostras do lado Kotlin
 * não são exigidas — cada plataforma tem sua própria régua determinística,
 * consistente dentro de si mesma, que é a garantia que importa.
 */
interface PopularityReference {
  mean: number;
  stdDeviation: number;
}

/** Amostras da varredura. 20 mil dá erro padrão da média ~0,4%. */
export const POPULARITY_REFERENCE_SAMPLES = 20_000;
const POPULARITY_REFERENCE_SEED = 20260910;

const referenceCache = new Map<Lottery, PopularityReference>();

function buildPopularityReference(lottery: Lottery): PopularityReference {
  const random: RandomSource = createSeededRandom(POPULARITY_REFERENCE_SEED);
  const { numberUniverse, numbersPerBet } = lotteryRules(lottery);
  const universe = Array.from({ length: numberUniverse }, (_, i) => i + 1);

  const penalties = new Array<number>(POPULARITY_REFERENCE_SAMPLES);
  for (let i = 0; i < POPULARITY_REFERENCE_SAMPLES; i += 1) {
    const game = new Set<number>();
    while (game.size < numbersPerBet) {
      game.add(universe[random.nextInt(universe.length)]);
    }
    penalties[i] = unpopularityPenalty(lottery, [...game]);
  }

  const n = penalties.length;
  const mean = penalties.reduce((sum, x) => sum + x, 0) / n;
  const sumSq = penalties.reduce((sum, x) => sum + (x - mean) * (x - mean), 0);
  // Amostral (n-1): a régua é usada para inferência sobre a popularidade de
  // uma combinação concreta, não como descrição da amostra em si.
  const sampleVariance = n < 2 ? 0 : sumSq / (n - 1);
  return { mean, stdDeviation: Math.sqrt(sampleVariance) };
}

function popularityReferenceOf(lottery: Lottery): PopularityReference {
  const cached = referenceCache.get(lottery);
  if (cached) return cached;
  const built = buildPopularityReference(lottery);
  referenceCache.set(lottery, built);
  return built;
}

function standardize(reference: PopularityReference, penalty: number): number {
  return reference.stdDeviation <= 0 ? 0 : (penalty - reference.mean) / reference.stdDeviation;
}

/**
 * Popularidade relativa de `numbers` frente à combinação média, a partir do
 * escore padronizado de `unpopularityPenalty`. 1,0 = popularidade média.
 */
export function relativePopularity(lottery: Lottery, numbers: readonly number[]): number {
  const reference = popularityReferenceOf(lottery);
  const z = standardize(reference, unpopularityPenalty(lottery, numbers));
  return Math.exp(POPULARITY_ELASTICITY * z);
}

/**
 * Ganho percentual no valor esperado **condicional a ganhar** a faixa de
 * rateio, por jogar uma combinação de popularidade relativa
 * `relativePopularity` em vez da média.
 *
 * Positivo quando a combinação é menos popular que a média. Não altera — e é
 * impossível que altere — a probabilidade de ganhar.
 */
export function conditionalPayoutGain(
  lottery: Lottery,
  popularity: number,
  tickets: number,
): number {
  if (popularity <= 0) {
    throw new RangeError('Popularidade relativa inválida');
  }
  const q0 = uniformSelectionProbability(lottery);
  const baseline = crowdingFactor(q0, tickets);
  if (baseline <= 0) return 0;
  const mine = crowdingFactor(Math.min(q0 * popularity, 1), tickets);
  return mine / baseline - 1;
}

/** O que se sabe sobre um jogo depois de medido. Nada aqui é previsão. */
export interface PayoutAssessment {
  lottery: Lottery;
  numbers: number[];
  /** Escore bruto de `unpopularityPenalty`; maior = mais popular. */
  penalty: number;
  /** Popularidade relativa à combinação média (1,0 = média). */
  relativePopularity: number;
  tickets: number;
  /** Fração do bolo que sobra para este jogo ao dividi-lo. */
  crowding: number;
  /** O mesmo fator para uma combinação de popularidade média. */
  baselineCrowding: number;
  /** Ganho no valor esperado condicional a ganhar, frente à média. */
  conditionalGain: number;
}

/** true quando o jogo é menos disputado que a combinação média. */
export function isBetterThanAverage(assessment: PayoutAssessment): boolean {
  return assessment.relativePopularity < 1;
}

/**
 * A frase que a interface deve exibir — inclui a ressalva, sempre. Sem ela o
 * número vira promessa, que é o que este app existe para não fazer.
 */
export function payoutSummary(assessment: PayoutAssessment): string {
  const pct = assessment.conditionalGain * 100;
  const direction = pct >= 0 ? 'a mais' : 'a menos';
  return `${Math.abs(pct).toFixed(1)}% ${direction} de prêmio se ganhar, pela mesma chance de ganhar.`;
}

/**
 * Avaliação completa de um jogo: quanto ele é popular e o que isso vale.
 * `tickets` é o número de apostas do concurso (arrecadação / preço).
 */
export function evaluatePayoutShare(
  lottery: Lottery,
  numbers: readonly number[],
  tickets: number,
): PayoutAssessment {
  const m = relativePopularity(lottery, numbers);
  const q0 = uniformSelectionProbability(lottery);
  return {
    lottery,
    numbers: [...numbers].sort((a, b) => a - b),
    penalty: unpopularityPenalty(lottery, numbers),
    relativePopularity: m,
    tickets,
    crowding: crowdingFactor(Math.min(q0 * m, 1), tickets),
    baselineCrowding: crowdingFactor(q0, tickets),
    conditionalGain: conditionalPayoutGain(lottery, m, tickets),
  };
}

/** O lote medido. Os campos agregados são médias simples entre os jogos. */
export interface PayoutBatchAssessment {
  lottery: Lottery;
  games: PayoutAssessment[];
  tickets: number;
}

/**
 * Avaliação de um lote inteiro. `tickets` vem da arrecadação informada pela
 * API; sem ela a interface não deve exibir ganho nenhum, porque o efeito do
 * rateio depende de quantas pessoas estão jogando.
 */
export function evaluatePayoutBatch(batch: GameBatch, tickets: number): PayoutBatchAssessment {
  const games = batch.games.map((game) => evaluatePayoutShare(batch.lottery, game.numbers, tickets));
  return { lottery: batch.lottery, games, tickets };
}

export function averageRelativePopularity(batch: PayoutBatchAssessment): number {
  if (batch.games.length === 0) return 1;
  return batch.games.reduce((sum, g) => sum + g.relativePopularity, 0) / batch.games.length;
}

/** Ganho médio no valor esperado condicional a ganhar. */
export function averageConditionalGain(batch: PayoutBatchAssessment): number {
  if (batch.games.length === 0) return 0;
  return batch.games.reduce((sum, g) => sum + g.conditionalGain, 0) / batch.games.length;
}

/** Quantos jogos do lote são menos disputados que a combinação média. */
export function betterThanAverageCount(batch: PayoutBatchAssessment): number {
  return batch.games.filter(isBetterThanAverage).length;
}

/**
 * A ressalva obrigatória. Nenhuma tela deve exibir `averageConditionalGain`
 * sem exibir também esta frase: o número é real, mas mede outra coisa que
 * não a chance de ganhar, e é fácil confundir as duas.
 */
export const PAYOUT_DISCLAIMER =
  'Este número não é chance de ganhar — a chance é idêntica para qualquer ' +
  'combinação e nada a altera. Ele mede quanto do prêmio sobraria para você, ' +
  'por dividi-lo com menos gente.';
