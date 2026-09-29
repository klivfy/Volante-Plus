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
 * `analyzeBacktest`. Não existem estratégias selecionáveis — todo lote é
 * `STRATEGY_LABEL`.
 *
 * ALGORITMO
 * 1. As dezenas elegíveis são ordenadas por `weight` e fatiadas em três tiers
 *    por percentil: 40% top, 30% mid, 30% low.
 * 2. Cada vaga do jogo sorteia primeiro um tier (`TOP_TIER_SHARE` = 70%,
 *    `MID_TIER_SHARE` = 20%, o restante 10% para o low) e depois uma dezena
 *    *dentro* do tier, com probabilidade proporcional ao peso.
 * 3. Jogo repetido dentro do lote é resorteado até `MAX_DEDUP_ATTEMPTS` vezes;
 *    passando disso, o jogo é aceito.
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
 * WHY 64 e não o mínimo global: escolher sempre a combinação menos popular
 * faria todo usuário do app jogar o mesmo bilhete — e o app, ele mesmo,
 * viraria a fonte de popularidade. Com 64 sorteios uniformes o jogo escolhido
 * cai, em média, entre os ~2% menos populares, mas continua aleatório.
 */
export const UNPOPULAR_CANDIDATES = 64;

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
        trevoStrategy,
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

  return {
    lottery,
    games,
    strategyLabel: strategy === 'UNPOPULAR' ? UNPOPULAR_STRATEGY_LABEL : STRATEGY_LABEL,
    performancesSnapshot: eligible,
    ...(pool === null ? {} : { sourcePool: [...pool].sort((a, b) => a - b) }),
  };
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
 * Os trevos são sorteados uniformemente — não há evidência de viés de
 * popularidade neles, e ranquear por frequência seria a mesma ilusão das dezenas.
 */
function buildUnpopularGame(
  lottery: Lottery,
  available: readonly number[],
  gameSize: number,
  trevoStrategy: TrevoStrategy,
  random: RandomSource,
): GeneratedGame {
  let best: number[] = [];
  let bestPenalty = Infinity;
  for (let i = 0; i < UNPOPULAR_CANDIDATES; i++) {
    const candidate = sampleDistinct(available, gameSize, random);
    const penalty = unpopularityPenalty(lottery, candidate);
    if (penalty < bestPenalty) {
      best = candidate;
      bestPenalty = penalty;
    }
  }
  if (!hasTrevos(lottery)) {
    return { numbers: best };
  }
  const universe = Array.from({ length: lotteryRules(lottery).trevoUniverse }, (_, i) => i + 1);
  const duplas: [number, number][] =
    trevoStrategy === TrevoStrategy.COBERTURA_TOTAL
      ? allTrevoPairs(lottery)
      : [sampleDistinct(universe, lotteryRules(lottery).trevosPerBet, random) as [number, number]];
  return { numbers: best, trevoDuplas: duplas };
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
