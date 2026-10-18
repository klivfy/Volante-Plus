import {
  GameBatch,
  GeneratedGame,
  Lottery,
  MAX_GAMES,
  MIN_GAMES,
  NumberPerformance,
  TrevoStrategy,
} from '../types/domain';
import { tierCuts } from './backtestAnalyzer';
import { hasTrevos, lotteryRules } from './prizeRules';
import { defaultRandom, RandomSource } from './random';
import { unpopularityPenalty } from './unpopularity';

/**
 * Gerador de lotes de jogos simples (6 dezenas).
 *
 * Fonte única de dados: a lista de `NumberPerformance` produzida pelo
 * `analyzeBacktest`.
 *
 * ALGORITMO (estratégia padrão `UNPOPULAR`)
 * 1. Cada jogo sorteia dezenas uniformemente (todos os jogos têm exatamente
 *    a mesma chance de ganhar — sorteio honesto é i.i.d. e nenhum histórico
 *    muda isso).
 * 2. Desempate por rateio: cada vaga do lote sorteia `UNPOPULAR_CANDIDATES`
 *    jogos pelo processo acima e fica com o menos popular segundo
 *    `unpopularityPenalty` (ver WHY no `payoutShare.ts` — a única otimização
 *    que a matemática autoriza).
 * 3. Jogo repetido dentro do lote é resorteado até `MAX_DEDUP_ATTEMPTS` vezes;
 *    passando disso, o jogo é aceito.
 * 4. Trevos complementares (+Milionária, Econômico): as duplas do lote são
 *    sorteadas sem repetição — com 3 jogos, uma partição aleatória dos 6
 *    trevos — maximizando a chance de pelo menos um prêmio pelo mesmo custo
 *    (SC-005 da spec 002).
 *
 * ALGORITMO (`FREQUENCY_TIERS`, legado): as dezenas elegíveis são ordenadas
 * por `weight` e fatiadas em três tiers por percentil (40/30/30); cada vaga
 * sorteia primeiro o tier (70/20/10) e depois a dezena, proporcional ao peso.
 * Estratégia mantida apenas para o backtest/benchmark, que medem que ela não
 * supera o acaso.
 *
 * WHY (padrão uniforme, não tiers): os tiers concentram 70% das vagas nas
 * dezenas de maior frequência medida — desproporcionalmente na faixa de
 * aniversário (≤ 31), a mais apostada —, de modo que o desempate por rateio
 * tinha de brigar contra o próprio sorteio. Com candidatos uniformes, o
 * desempate explora todo o universo a cada vaga.
 *
 * WHY (tiers recalculados aqui): o tier gravado em cada `NumberPerformance` é
 * relativo ao universo inteiro da loteria. No modo Fechamento o universo
 * encolhe para as dezenas marcadas no volante, então as fatias 40/30/30
 * precisam ser recalculadas sobre o conjunto elegível — caso contrário um
 * fechamento só com dezenas "frias" ficaria sem tier top algum.
 *
 * Porta direta do `GameGenerator.kt` do app Android.
 */

/** Rótulo do lote gerado pela estratégia legada por tiers de frequência. */
export const STRATEGY_LABEL = 'Backtest-Driven';

/** Rótulo do lote gerado pela estratégia padrão, de baixa popularidade. */
export const UNPOPULAR_STRATEGY_LABEL = 'Baixa popularidade';

/**
 * - `UNPOPULAR` (padrão): dezenas sorteadas uniformemente; entre
 *   `UNPOPULAR_CANDIDATES` candidatos por jogo fica o menos popular segundo
 *   `unpopularityPenalty`. Não altera a chance de ganhar (teorema da
 *   invariância) — só reduz com quantos apostadores o prêmio seria dividido.
 * - `FREQUENCY_TIERS`: a estratégia anterior, por tiers de frequência
 *   histórica. Mantida para o backtest e o benchmark, que existem justamente
 *   para medir que ela não supera o acaso.
 */
export type GenerationStrategy = 'UNPOPULAR' | 'FREQUENCY_TIERS';

/**
 * Candidatos avaliados por jogo na estratégia `UNPOPULAR`.
 *
 * WHY 12 e não o mínimo global: escolher sempre a combinação menos popular
 * faria todo usuário do app jogar o mesmo bilhete — e o app, ele mesmo,
 * viraria a fonte de popularidade. Medido (protocolo do Kotlin
 * `PAYOUT_CANDIDATES`: 4.000 lotes por configuração, Mega-Sena, 20 milhões de
 * apostas no concurso, sorteio uniforme — `candidateTuning.benchmark.test.ts`):
 *
 * | candidatos | ganho médio | dezenas ≤ 31 | jogos repetidos |
 * |-----------:|------------:|-------------:|----------------:|
 * | 1          | −0,73%      | 51,6%        | 5 em 16.000     |
 * | 4          | +4,58%      | 37,1%        | 4 em 16.000     |
 * | 12         | **+6,68%**  | 28,5%        | 11 em 16.000    |
 * | 24         | +7,64%      | 23,7%        | 16 em 16.000    |
 * | 64         | +8,65%      | 18,3%        | 24 em 16.000    |
 *
 * 12 captura 77% do ganho disponível; acima disso o retorno é decrescente e a
 * concentração cresce — e concentrar os lotes de todos os usuários nas mesmas
 * combinações "ótimas" recriaria a aglomeração que a otimização existe para
 * evitar, desta vez causada pelo próprio app.
 */
export const UNPOPULAR_CANDIDATES = 12;

/** Proporção-alvo de vagas por tier (o low fica com o restante, 10%). */
export const TOP_TIER_SHARE = 0.7;
export const MID_TIER_SHARE = 0.2;

/** Resorteios antes de aceitar um jogo repetido no lote. */
export const MAX_DEDUP_ATTEMPTS = 10;

const TOP_TIER_INDEX = 0;
const MID_TIER_INDEX = 1;
const LOW_TIER_INDEX = 2;

export interface GenerateOptions {
  /** Desempenho dos trevos 1..6; vazio ou incompleto cai no fallback uniforme. */
  trevoPerformances?: NumberPerformance[];
  /** Cobertura de trevos; padrão `ECONOMICO` (1 dupla por jogo). */
  trevoStrategy?: TrevoStrategy;
  /** Modo Fechamento: restringe o sorteio às dezenas marcadas no volante. */
  pool?: Iterable<number>;
  /** Injetável para lotes reproduzíveis e testes determinísticos. */
  random?: RandomSource;
  /** Estratégia de sorteio; padrão `UNPOPULAR`. */
  strategy?: GenerationStrategy;
  /**
   * Candidatos sorteados por jogo no desempate por popularidade (espelho do
   * `payoutCandidates` do Kotlin); padrão `UNPOPULAR_CANDIDATES`. `1` desliga
   * o desempate e deixa o lote inteiramente uniforme.
   */
  candidates?: number;
  /**
   * Dezenas do concurso mais recente: entram no `unpopularityPenalty` como
   * menos apostadas (falácia do apostador — ver `unpopularity.ts`). Ausente
   * em protocolos determinísticos (ex.: backtest).
   */
  recentNumbers?: Iterable<number>;
}

/**
 * Quantos jogos cabem num lote sem repetir nenhuma dezena entre eles.
 *
 * A deduplicação absoluta trata as dezenas elegíveis como um bolo que não se
 * repõe: 4 jogos de Mega-Sena exigem 24 dezenas distintas. Com um fechamento
 * de 15 dezenas, por exemplo, só há espaço para 2 jogos.
 */
export function maxDistinctGames(lottery: Lottery, eligibleCount: number): number {
  return Math.floor(eligibleCount / lotteryRules(lottery).numbersPerBet);
}

/**
 * Gera um lote de `count` jogos a partir do desempenho medido das dezenas.
 *
 * O lote pode sair menor que `count`: ver `maxDistinctGames`.
 *
 * @param count quantidade de jogos, em `MIN_GAMES`..`MAX_GAMES`.
 * @param performances desempenho das dezenas; obrigatório e não vazio.
 * @throws RangeError quando `count` está fora dos limites, o desempenho está
 *   vazio/insuficiente ou o fechamento contém dezenas inválidas.
 */
export function generateGames(
  lottery: Lottery,
  count: number,
  performances: NumberPerformance[],
  options: GenerateOptions = {},
): GameBatch {
  const rules = lotteryRules(lottery);
  const random = options.random ?? defaultRandom;
  const trevoStrategy = options.trevoStrategy ?? TrevoStrategy.ECONOMICO;

  if (!Number.isInteger(count) || count < MIN_GAMES || count > MAX_GAMES) {
    throw new RangeError(
      `Quantidade de jogos deve estar em ${MIN_GAMES}..${MAX_GAMES} (recebido: ${count})`,
    );
  }
  if (performances.length === 0) {
    throw new RangeError('Geração exige o desempenho das dezenas (lista vazia)');
  }

  const inUniverse = (number: number): boolean =>
    Number.isInteger(number) && number >= 1 && number <= rules.numberUniverse;

  const pool = options.pool === undefined ? null : [...options.pool];
  if (pool !== null) {
    if (new Set(pool).size !== pool.length) {
      throw new RangeError('Dezenas repetidas no fechamento');
    }
    const invalid = pool.find((number) => !inUniverse(number));
    if (invalid !== undefined) {
      throw new RangeError(
        `Dezena ${invalid} do fechamento fora do intervalo 1..${rules.numberUniverse}`,
      );
    }
  }
  const poolSet = pool === null ? null : new Set(pool);

  const eligible = performances.filter(
    (performance) =>
      inUniverse(performance.number) &&
      (poolSet === null || poolSet.has(performance.number)),
  );
  if (eligible.length < rules.numbersPerBet) {
    throw new RangeError(
      `Desempenho insuficiente para formar um jogo (dezenas elegíveis: ${eligible.length})`,
    );
  }

  const strategy = options.strategy ?? 'UNPOPULAR';
  const candidateCount = options.candidates ?? UNPOPULAR_CANDIDATES;
  if (!Number.isInteger(candidateCount) || candidateCount < 1) {
    throw new RangeError(`Candidatos por jogo deve ser >= 1 (recebido: ${candidateCount})`);
  }
  const recentNumbers = options.recentNumbers === undefined ? [] : [...options.recentNumbers];
  const numberTiers = tiersOf(eligible);
  const trevoTiers = buildTrevoTiers(lottery, options.trevoPerformances ?? []);

  // DEDUPLICAÇÃO ABSOLUTA: compartilhamos um Set de dezenas usadas entre todos os jogos
  const usedNumbersGlobal = new Set<number>();
  const games: GeneratedGame[] = [];

  // Cada jogo retira `numbersPerBet` dezenas de um bolo que não se repõe, então
  // o lote satura em `floor(elegíveis / numbersPerBet)`. Sem esse teto, os
  // jogos seguintes sairiam incompletos (o sorteio simplesmente fica sem
  // dezenas disponíveis) — pior que devolver menos jogos. Quem chama compara
  // `games.length` com o pedido para avisar o usuário; ver `maxDistinctGames`.
  const effectiveCount = Math.min(count, maxDistinctGames(lottery, eligible.length));

  for (let index = 0; index < effectiveCount; index++) {
    if (strategy === 'UNPOPULAR') {
      const game = buildUnpopularGame(
        lottery,
        eligible.map((performance) => performance.number).filter((n) => !usedNumbersGlobal.has(n)),
        rules.numbersPerBet,
        candidateCount,
        recentNumbers,
        random,
      );
      game.numbers.forEach((n) => usedNumbersGlobal.add(n));
      games.push(game);
      continue;
    }
    games.push(
      nextDistinctGameWithGlobalDedup(games, usedNumbersGlobal, {
        gameSize: rules.numbersPerBet,
        numberTiers,
        lottery,
        trevoStrategy,
        trevoTiers,
        random,
      }),
    );
  }

  // WHY (trevos por lote, não por jogo): na estratégia padrão, sortear a dupla
  // independentemente por jogo pode repetir duplas dentro do lote. Duplas
  // distintas maximizam a chance de pelo menos um prêmio pelo mesmo custo —
  // a spec 002 mede 25,4% contra 25,1% em lotes de 3 jogos. A estratégia
  // legada mantém o sorteio por jogo: o laboratório mede o comportamento
  // antigo, não o novo.
  const finishedGames =
    strategy === 'UNPOPULAR' ? assignBatchTrevoDuplas(lottery, games, trevoStrategy, random) : games;

  return {
    lottery,
    games: finishedGames,
    strategyLabel: strategy === 'UNPOPULAR' ? UNPOPULAR_STRATEGY_LABEL : STRATEGY_LABEL,
    performancesSnapshot: eligible,
    ...(pool === null ? {} : { sourcePool: [...pool].sort((a, b) => a - b) }),
  };
}

/**
 * Duplas de trevos do lote inteiro (estratégia padrão).
 *
 * - COBERTURA_TOTAL: cada jogo leva as 15 duplas (inalterado).
 * - ECONÔMICO: uma dupla distinta por jogo; com até 3 jogos, as duplas saem
 *   de uma partição aleatória dos 6 trevos (disjuntas — o lote cobre 2·k
 *   trevos); com 4 ou 5 jogos, as 3 duplas da partição cobrem os 6 trevos e
 *   as demais completam com duplas distintas sorteadas. A ordem final é
 *   embaralhada para não concentrar os usuários do app nos mesmos arranjos.
 */
function assignBatchTrevoDuplas(
  lottery: Lottery,
  games: GeneratedGame[],
  trevoStrategy: TrevoStrategy,
  random: RandomSource,
): GeneratedGame[] {
  if (!hasTrevos(lottery)) return games;
  if (trevoStrategy === TrevoStrategy.COBERTURA_TOTAL) {
    const all = allTrevoPairs(lottery);
    return games.map((game) => ({ ...game, trevoDuplas: all }));
  }
  const duplas = complementaryTrevoDuplas(lottery, games.length, random);
  return games.map((game, index) => ({ ...game, trevoDuplas: [duplas[index]] }));
}

/** Duplas distintas para `count` jogos, com a partição aleatória descrita acima. */
function complementaryTrevoDuplas(
  lottery: Lottery,
  count: number,
  random: RandomSource,
): [number, number][] {
  const universe = trevoUniverse(lottery);
  const shuffled = sampleDistinct(universe, universe.length, random);
  const matching: [number, number][] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const a = shuffled[i];
    const b = shuffled[i + 1];
    matching.push([Math.min(a, b), Math.max(a, b)]);
  }
  if (count <= matching.length) {
    return shuffleArray(matching, random).slice(0, count);
  }
  const all = allTrevoPairs(lottery);
  const extras = all.filter(
    (dupla) => !matching.some((m) => m[0] === dupla[0] && m[1] === dupla[1]),
  );
  return shuffleArray(
    [...matching, ...shuffleArray(extras, random).slice(0, count - matching.length)],
    random,
  );
}

/** Fisher–Yates com o RNG injetado (reproduzível em teste). */
function shuffleArray<T>(array: readonly T[], random: RandomSource): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** `k` elementos distintos de `pool`, uniformes (Fisher-Yates parcial). */
function sampleDistinct(pool: readonly number[], k: number, random: RandomSource): number[] {
  const copy = [...pool];
  for (let i = 0; i < k; i++) {
    const j = i + random.nextInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k).sort((a, b) => a - b);
}

/**
 * Jogo da estratégia `UNPOPULAR`: o de menor `unpopularityPenalty` entre
 * `UNPOPULAR_CANDIDATES` sorteios uniformes das dezenas ainda disponíveis.
 * As duplas de trevos são atribuídas **por lote** depois, em
 * `assignBatchTrevoDuplas` — nunca aqui.
 */
function buildUnpopularGame(
  lottery: Lottery,
  available: readonly number[],
  gameSize: number,
  candidates: number,
  recentNumbers: readonly number[],
  random: RandomSource,
): GeneratedGame {
  let best: number[] = [];
  let bestPenalty = Infinity;
  for (let i = 0; i < candidates; i++) {
    const candidate = sampleDistinct(available, gameSize, random);
    const penalty = unpopularityPenalty(lottery, candidate, recentNumbers);
    if (penalty < bestPenalty) {
      best = candidate;
      bestPenalty = penalty;
    }
  }
  return { numbers: best };
}

interface BuildContext {
  gameSize: number;
  numberTiers: NumberPerformance[][];
  lottery: Lottery;
  trevoStrategy: TrevoStrategy;
  trevoTiers: NumberPerformance[][];
  random: RandomSource;
}

/**
 * Deduplicação absoluta: resorteia enquanto o jogo contém dezenas já usadas
 * em outros jogos do lote. Garante 24 dezenas distintas em 4 jogos.
 * Compartilha um `usedNumbersGlobal` entre todos os jogos do lote.
 */
function nextDistinctGameWithGlobalDedup(
  existing: GeneratedGame[],
  usedNumbersGlobal: Set<number>,
  context: BuildContext,
): GeneratedGame {
  const signatures = new Set(existing.map((game) => game.numbers.join('-')));

  let candidate = buildGameAvoidingUsedNumbers(context, usedNumbersGlobal);
  let attempts = 1;
  while (
    attempts < MAX_DEDUP_ATTEMPTS &&
    (signatures.has(candidate.numbers.join('-')) ||
      candidate.numbers.some((n) => usedNumbersGlobal.has(n)))
  ) {
    candidate = buildGameAvoidingUsedNumbers(context, usedNumbersGlobal);
    attempts++;
  }

  // Adiciona as dezenas desse jogo ao set global
  for (const number of candidate.numbers) {
    usedNumbersGlobal.add(number);
  }

  return candidate;
}

/**
 * Construir jogo evitando dezenas que já foram usadas globalmente no lote.
 * Estende a estratégia de `pickFromTiers` para rejeitar números já presentes
 * em `usedNumbersGlobal`.
 */
function buildGameAvoidingUsedNumbers(
  context: BuildContext,
  usedNumbersGlobal: Set<number>,
): GeneratedGame {
  const picked = new Set<number>();
  while (picked.size < context.gameSize) {
    const number = pickFromTiersAvoidingUsed(
      context.numberTiers,
      picked,
      usedNumbersGlobal,
      context.random,
    );
    if (number === null) {
      break;
    }
    picked.add(number);
  }

  const numbers = [...picked].sort((a, b) => a - b);
  const duplas = trevoDuplas(context);
  return duplas.length === 0 ? { numbers } : { numbers, trevoDuplas: duplas };
}

/**
 * Sorteia o tier pela proporção-alvo e depois a dezena, ponderada pelo peso.
 * Se o tier sorteado já se esgotou, percorre os demais em ordem circular —
 * nunca devolve um jogo incompleto enquanto houver dezena disponível.
 */
function pickFromTiers(
  tiers: NumberPerformance[][],
  taken: Set<number>,
  random: RandomSource,
): number | null {
  const roll = random.nextFloat();
  const start =
    roll < TOP_TIER_SHARE
      ? TOP_TIER_INDEX
      : roll < TOP_TIER_SHARE + MID_TIER_SHARE
        ? MID_TIER_INDEX
        : LOW_TIER_INDEX;

  for (let offset = 0; offset < tiers.length; offset++) {
    const candidates = tiers[(start + offset) % tiers.length].filter(
      (performance) => !taken.has(performance.number),
    );
    if (candidates.length > 0) {
      return weightedPick(candidates, random);
    }
  }
  return null;
}

/**
 * Extensão de `pickFromTiers` que também rejeita dezenas já usadas globalmente
 * no lote (deduplicação absoluta). Filtra candidatos removendo tanto `taken`
 * (do jogo atual) quanto `usedGlobally` (de todos os jogos anteriores).
 */
function pickFromTiersAvoidingUsed(
  tiers: NumberPerformance[][],
  taken: Set<number>,
  usedGlobally: Set<number>,
  random: RandomSource,
): number | null {
  const roll = random.nextFloat();
  const start =
    roll < TOP_TIER_SHARE
      ? TOP_TIER_INDEX
      : roll < TOP_TIER_SHARE + MID_TIER_SHARE
        ? MID_TIER_INDEX
        : LOW_TIER_INDEX;

  for (let offset = 0; offset < tiers.length; offset++) {
    const candidates = tiers[(start + offset) % tiers.length].filter(
      (performance) => !taken.has(performance.number) && !usedGlobally.has(performance.number),
    );
    if (candidates.length > 0) {
      return weightedPick(candidates, random);
    }
  }
  return null;
}

/** Roleta proporcional ao peso; pesos todos nulos degeneram em uniforme. */
function weightedPick(candidates: NumberPerformance[], random: RandomSource): number {
  const total = candidates.reduce(
    (sum, candidate) => sum + Math.max(0, candidate.weight),
    0,
  );
  if (total <= 0) {
    return candidates[random.nextInt(candidates.length)].number;
  }
  let threshold = random.nextFloat() * total;
  for (const candidate of candidates) {
    threshold -= Math.max(0, candidate.weight);
    if (threshold <= 0) {
      return candidate.number;
    }
  }
  return candidates[candidates.length - 1].number;
}

/** Fatia o ranking em top/mid/low pelos percentis 40/30/30. */
function tiersOf(performances: NumberPerformance[]): NumberPerformance[][] {
  const ranked = [...performances].sort(
    (a, b) => b.weight - a.weight || a.number - b.number,
  );
  const [topCut, midCut] = tierCuts(ranked.length);
  return [
    ranked.slice(0, topCut),
    ranked.slice(topCut, midCut),
    ranked.slice(midCut),
  ];
}

/**
 * Tiers dos trevos 1..6. WHY: quando o backtest não produziu desempenho de
 * trevos (ou produziu incompleto), o fallback é peso igual para todos — melhor
 * um sorteio uniforme honesto que um ranking sobre dados parciais.
 */
function buildTrevoTiers(
  lottery: Lottery,
  trevoPerformances: NumberPerformance[],
): NumberPerformance[][] {
  if (!hasTrevos(lottery)) {
    return [[], [], []];
  }
  const universe = trevoUniverse(lottery);
  const covered = trevoPerformances.filter((performance) =>
    universe.includes(performance.number),
  );
  const complete =
    new Set(covered.map((performance) => performance.number)).size === universe.length;

  const source = complete
    ? covered
    : universe.map<NumberPerformance>((number) => ({
        number,
        hitCount: 0,
        simulatedHitRate: 0,
        weight: 1,
        tier: 'mid',
      }));

  return tiersOf(source);
}

function trevoDuplas(context: BuildContext): [number, number][] {
  if (!hasTrevos(context.lottery)) {
    return [];
  }
  return context.trevoStrategy === TrevoStrategy.COBERTURA_TOTAL
    ? allTrevoPairs(context.lottery)
    : [pickTrevoDupla(context)];
}

function pickTrevoDupla(context: BuildContext): [number, number] {
  const rules = lotteryRules(context.lottery);
  const dupla = new Set<number>();
  while (dupla.size < rules.trevosPerBet) {
    const trevo = pickFromTiers(context.trevoTiers, dupla, context.random);
    if (trevo === null) {
      break;
    }
    dupla.add(trevo);
  }
  const [first, second] = [...dupla].sort((a, b) => a - b);
  return [first, second];
}

/** As C(6,2) = 15 duplas possíveis de trevos (Cobertura total). */
export function allTrevoPairs(lottery: Lottery): [number, number][] {
  const universe = trevoUniverse(lottery);
  const pairs: [number, number][] = [];
  for (let i = 0; i < universe.length; i++) {
    for (let j = i + 1; j < universe.length; j++) {
      pairs.push([universe[i], universe[j]]);
    }
  }
  return pairs;
}

function trevoUniverse(lottery: Lottery): number[] {
  const { trevoUniverse: size } = lotteryRules(lottery);
  return Array.from({ length: size }, (_, index) => index + 1);
}
