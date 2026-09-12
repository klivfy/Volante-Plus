import {
  Draw,
  Lottery,
  NumberPerformance,
  PerformanceTier,
} from '../types/domain';
import { hasTrevos, lotteryRules } from './prizeRules';
import { defaultRandom, RandomSource } from './random';

/**
 * Deriva o desempenho de cada dezena a partir dos concursos analisados.
 * É a única fonte de dados do gerador de jogos: sem `NumberPerformance` não
 * existe geração.
 *
 * A nota de cada dezena combina duas evidências de naturezas diferentes:
 *
 * 1. **Frequência real** (`hitCount`, peso `HIT_COUNT_WEIGHT`) — quantas vezes
 *    a dezena saiu de fato, normalizada pela dezena mais frequente da janela.
 * 2. **Simulação** (`simulatedHitRate`, peso `SIMULATION_WEIGHT`) —
 *    mini-simulações de Monte Carlo, ver `simulateHitRate`.
 *
 * WHY: o app é um laboratório que existe para *refutar* a crença em dezenas
 * quentes, não para vendê-la. A componente simulada injeta ruído amostral
 * deliberado no ranking, de modo que dezenas com frequências parecidas
 * embaralhem entre si a cada análise — exatamente o que a hipótese nula prevê.
 * Um ranking puramente por frequência daria uma falsa impressão de estabilidade
 * que os dados não sustentam.
 *
 * Porta direta do `BacktestAnalyzer.kt` do app Android.
 */

/** Rodadas de Monte Carlo executadas por dezena. */
export const DEFAULT_SIMULATIONS_PER_NUMBER = 200;

/** Pesos da combinação frequência real x simulação (somam 1,0). */
export const HIT_COUNT_WEIGHT = 0.6;
export const SIMULATION_WEIGHT = 0.4;

/** Percentis dos tiers: 40% top, 30% mid, 30% low. */
export const TOP_TIER_PERCENTILE = 0.4;
export const MID_TIER_PERCENTILE = 0.3;

/**
 * Peso atribuído quando não há histórico para diferenciar as dezenas.
 * O valor exato é irrelevante para a seleção ponderada (que é invariante a
 * escala); o que importa é ser idêntico para todas — sorteio uniforme honesto.
 */
export const EMPTY_HISTORY_WEIGHT = 0.5;

export interface AnalyzeOptions {
  /** Injetável para relatórios reproduzíveis e testes determinísticos. */
  random?: RandomSource;
}

/**
 * Desempenho das dezenas do universo da loteria (1..60 Mega, 1..50 +Milionária).
 *
 * Concursos de outra loteria são descartados: `draws` costuma vir de um cache
 * único, e misturar universos corromperia as frequências.
 *
 * @param simulationsPerDraw rodadas de simulação por dezena; 0 desliga a
 *   componente simulada e deixa o ranking puramente por frequência.
 * @returns lista ordenada por `weight` decrescente (empate pelo número).
 */
export function analyzeBacktest(
  draws: Draw[],
  lottery: Lottery,
  simulationsPerDraw: number = DEFAULT_SIMULATIONS_PER_NUMBER,
  options: AnalyzeOptions = {},
): NumberPerformance[] {
  const rules = lotteryRules(lottery);
  const observations = draws
    .filter((draw) => draw.lottery === lottery)
    .map((draw) => draw.numbers)
    .filter((numbers) => numbers.length > 0);

  return rank({
    universe: range(1, rules.numberUniverse),
    observations,
    sampleSize: rules.numbersDrawn,
    rounds: simulationsPerDraw,
    random: options.random ?? defaultRandom,
  });
}

/**
 * Desempenho dos trevos 1..6 sob exatamente o mesmo algoritmo.
 * Retorna vazio para loterias sem trevos — o gerador cai no fallback de pesos
 * iguais nesse caso.
 */
export function analyzeTrevoBacktest(
  draws: Draw[],
  lottery: Lottery,
  simulationsPerDraw: number = DEFAULT_SIMULATIONS_PER_NUMBER,
  options: AnalyzeOptions = {},
): NumberPerformance[] {
  if (!hasTrevos(lottery)) {
    return [];
  }
  const rules = lotteryRules(lottery);
  const observations = draws
    .filter((draw) => draw.lottery === lottery)
    .map((draw) => draw.trevos ?? [])
    .filter((trevos) => trevos.length > 0);

  return rank({
    universe: range(1, rules.trevoUniverse),
    observations,
    sampleSize: rules.trevosDrawn,
    rounds: simulationsPerDraw,
    random: options.random ?? defaultRandom,
  });
}

interface RankInput {
  universe: number[];
  observations: number[][];
  sampleSize: number;
  rounds: number;
  random: RandomSource;
}

/** Linha intermediária do ranking, antes da normalização e do tier. */
interface Row {
  number: number;
  hitCount: number;
  simulatedHitRate: number;
  rawScore: number;
}

function rank({
  universe,
  observations,
  sampleSize,
  rounds,
  random,
}: RankInput): NumberPerformance[] {
  // WHY: sem observações não há nada que diferencie uma dezena da outra. Todas
  // recebem o mesmo peso (a seleção ponderada vira uniforme) e o tier médio,
  // para que o gerador continue funcionando — sorteio puro — em vez de falhar
  // por falta de histórico.
  if (observations.length === 0) {
    return universe.map((number) => ({
      number,
      hitCount: 0,
      simulatedHitRate: 0,
      weight: EMPTY_HISTORY_WEIGHT,
      tier: 'mid' as PerformanceTier,
    }));
  }

  const counts = new Map<number, number>();
  for (const observation of observations) {
    for (const number of observation) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }
  const maxCount = Math.max(0, ...counts.values());

  const rows: Row[] = universe.map((number) => {
    const hitCount = counts.get(number) ?? 0;
    const normalizedHits = maxCount === 0 ? 0 : hitCount / maxCount;
    const simulatedHitRate = simulateHitRate({
      number,
      universe,
      observations,
      sampleSize,
      rounds,
      random,
    });
    return {
      number,
      hitCount,
      simulatedHitRate,
      rawScore:
        normalizedHits * HIT_COUNT_WEIGHT + simulatedHitRate * SIMULATION_WEIGHT,
    };
  });

  // Normalização: o melhor da janela vale 1,0 e o resto é proporcional.
  const maxScore = Math.max(...rows.map((row) => row.rawScore));
  const ranked = rows
    .map((row) => ({
      row,
      weight: maxScore <= 0 ? EMPTY_HISTORY_WEIGHT : row.rawScore / maxScore,
    }))
    .sort((a, b) => b.weight - a.weight || a.row.number - b.row.number);

  const [topCut, midCut] = tierCuts(ranked.length);

  return ranked.map(({ row, weight }, index) => ({
    number: row.number,
    hitCount: row.hitCount,
    simulatedHitRate: row.simulatedHitRate,
    weight,
    tier: index < topCut ? 'top' : index < midCut ? 'mid' : 'low',
  }));
}

/**
 * Mini-simulação: em cada rodada monta um jogo aleatório que contém
 * obrigatoriamente `number`, sorteia um concurso observado e conta os acertos
 * do jogo contra ele. O retorno é a média de acertos por rodada dividida pelo
 * tamanho do jogo — portanto sempre em 0..1.
 *
 * WHY: as vagas companheiras são ruído puro e convergem para o baseline
 * hipergeométrico; o que sobra de sinal vem de `number` estar (ou não) nos
 * concursos sorteados. Assim a métrica mede a mesma coisa que a frequência,
 * mas *com* a variância amostral que a frequência esconde.
 */
function simulateHitRate({
  number,
  universe,
  observations,
  sampleSize,
  rounds,
  random,
}: RankInput & { number: number }): number {
  if (rounds <= 0 || sampleSize <= 0 || universe.length === 0) {
    return 0;
  }
  const companions = universe.filter((candidate) => candidate !== number);
  let hits = 0;

  for (let round = 0; round < rounds; round++) {
    const game = new Set<number>([number]);
    while (game.size < sampleSize && game.size < universe.length) {
      game.add(companions[random.nextInt(companions.length)]);
    }
    const observed = observations[random.nextInt(observations.length)];
    for (const picked of game) {
      if (observed.includes(picked)) {
        hits++;
      }
    }
  }

  return hits / (rounds * sampleSize);
}

/** Índices de corte top/mid sobre um ranking de `size` dezenas. */
export function tierCuts(size: number): [topCut: number, midCut: number] {
  const topCut = Math.min(Math.ceil(size * TOP_TIER_PERCENTILE), size);
  const midCut = Math.min(topCut + Math.ceil(size * MID_TIER_PERCENTILE), size);
  return [topCut, midCut];
}

function range(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value++) {
    values.push(value);
  }
  return values;
}
