import { Draw, Lottery, NumberPerformance } from '../types/domain';
import { analyzeBacktest } from './backtestAnalyzer';
import { generateGames } from './gameGenerator';
import { anyPrizeProbability } from './powerAnalysis';
import { lotteryRules, classifyHits } from './prizeRules';
import { createSeededRandom, defaultRandom, RandomSource } from './random';
import { binomialExactTest } from './statisticalTests';
import { shuffleArray } from './statUtils';
import { bonferroniCorrection, benjaminiHochberg } from './multipleComparisons';

/**
 * Benchmark comparativo de estratégias de geração de jogos.
 *
 * O gerador padrão (`gameGenerator.ts`, `BACKTEST_TIERS`) usa o tier-weighted
 * 70/20/10 sobre o desempenho medido em `backtestAnalyzer.ts` + desempate de
 * popularidade — não há como, dentro do app, comparar esse método contra
 * alternativas (frequência pura, números frios, sorteio uniforme). Este
 * módulo roda todas elas contra o mesmo histórico de validação e aplica
 * correção de múltiplas comparações, para responder honestamente:
 * "70/20/10 é melhor, ou só parece melhor porque testamos só ele?"
 */

export type StrategyName =
  | 'tier-weighted'
  | 'frequency-pure'
  | 'cold-numbers'
  | 'random-uniform'
  | 'gap-maximizer';

export interface StrategyResult {
  strategy: StrategyName;
  description: string;
  totalGames: number;
  totalBets: number;
  meanHits: number;
  expectedMeanHits: number;
  prizeRate: number;
  prizeCount: number;
  pValue: number;
  significantRaw: boolean;
}

export interface BenchmarkResult {
  results: StrategyResult[];
  /** Após correção de Bonferroni (conservadora, controla família de erro). */
  bonferroni: { strategy: StrategyName; significant: boolean }[];
  /** Após correção Benjamini-Hochberg (controla taxa de falsas descobertas). */
  benjaminiHochberg: { strategy: StrategyName; significant: boolean }[];
}

const STRATEGY_DESCRIPTIONS: Record<StrategyName, string> = {
  'tier-weighted': 'Método do app: 70% top / 20% mid / 10% low, ponderado por desempenho',
  'frequency-pure': 'Sempre as dezenas de um jogo historicamente mais frequentes',
  'cold-numbers': 'Favorece as dezenas menos frequentes ("atrasadas")',
  'random-uniform': 'Baseline: dezenas de um jogo uniformemente aleatórias (sem uso do histórico)',
  'gap-maximizer': 'Maximiza a distância mínima entre as dezenas escolhidas',
};

/**
 * Gera `count` jogos simples (sem trevos) segundo a estratégia nomeada.
 * Exportada para reuso em `bankrollSimulation.ts` — mesma lógica, sem
 * duplicar a implementação de cada estratégia.
 */
export function generateForStrategy(
  strategy: StrategyName,
  lottery: Lottery,
  performances: NumberPerformance[],
  count: number,
  random: RandomSource,
): number[][] {
  const rules = lotteryRules(lottery);
  const gameSize = rules.numbersPerBet;

  switch (strategy) {
    case 'tier-weighted': {
      const batch = generateGames(lottery, Math.max(count, 2), performances, {
        random,
        strategy: 'FREQUENCY_TIERS',
      });
      return batch.games.slice(0, count).map((game) => game.numbers);
    }
    case 'frequency-pure': {
      const top = [...performances]
        .sort((a, b) => b.weight - a.weight || a.number - b.number)
        .slice(0, gameSize)
        .map((p) => p.number)
        .sort((a, b) => a - b);
      return Array.from({ length: count }, () => top);
    }
    case 'cold-numbers': {
      const sorted = [...performances].sort((a, b) => a.weight - b.weight || a.number - b.number);
      const games: number[][] = [];
      for (let i = 0; i < count; i++) {
        const coldCount = Math.ceil(gameSize * 0.66);
        const cold = sorted.slice(0, coldCount).map((p) => p.number);
        const restPool = sorted.slice(coldCount).map((p) => p.number);
        const filler = shuffleArray(restPool, random).slice(0, gameSize - cold.length);
        games.push([...cold, ...filler].sort((a, b) => a - b));
      }
      return games;
    }
    case 'random-uniform': {
      const universe = performances.map((p) => p.number);
      return Array.from({ length: count }, () =>
        shuffleArray(universe, random).slice(0, gameSize).sort((a, b) => a - b),
      );
    }
    case 'gap-maximizer': {
      const universe = performances.map((p) => p.number);
      const games: number[][] = [];
      for (let i = 0; i < count; i++) {
        let bestGame: number[] = [];
        let bestScore = -1;
        // Greedy: 100 tentativas aleatórias, mantém o maior gap mínimo entre dezenas.
        for (let t = 0; t < 100; t++) {
          const candidate = shuffleArray(universe, random).slice(0, gameSize).sort((a, b) => a - b);
          const gaps = candidate.slice(1).map((n, index) => n - candidate[index]);
          const minGap = Math.min(...gaps);
          if (minGap > bestScore) {
            bestScore = minGap;
            bestGame = candidate;
          }
        }
        games.push(bestGame);
      }
      return games;
    }
    default:
      return [];
  }
}

/**
 * Roda todas as estratégias contra os mesmos `training`/`validation` e
 * devolve o comparativo com correção de múltiplas comparações.
 *
 * WHY (apenas dezenas, sem trevos): comparar estratégias de trevos exigiria
 * replicar as duas estratégias de cobertura (`TrevoStrategy`) para cada
 * candidata — fora do escopo de um benchmark exploratório. O app continua
 * usando `generateGames` (com trevos) normalmente para a geração real.
 */
export function runStrategyBenchmark(
  training: Draw[],
  validation: Draw[],
  lottery: Lottery,
  options: { gamesPerContest?: number; simulationRounds?: number; seed?: number } = {},
): BenchmarkResult {
  const gamesPerContest = options.gamesPerContest ?? 2;
  const random: RandomSource =
    options.seed === undefined ? defaultRandom : createSeededRandom(options.seed);

  const performances = analyzeBacktest(training, lottery, options.simulationRounds, { random });
  const rules = lotteryRules(lottery);
  // O benchmark conta prêmios só por dezenas, mas o baseline completo segue
  // valendo: as faixas oficiais da +Milionária cobrem todos os resultados de
  // trevos (0..2) para dezenas premiadas, então P(algum prêmio) coincide com
  // a soma só de dezenas (ver doc de `anyPrizeProbability`).
  const p0 = anyPrizeProbability(lottery);

  const strategies: StrategyName[] = [
    'tier-weighted',
    'frequency-pure',
    'cold-numbers',
    'random-uniform',
    'gap-maximizer',
  ];

  const results: StrategyResult[] = strategies.map((strategy) => {
    const hitsPerGame: number[] = [];
    let prizeCount = 0;
    let totalBets = 0;

    for (const draw of validation) {
      const games = generateForStrategy(strategy, lottery, performances, gamesPerContest, random);
      for (const numbers of games) {
        const hits = numbers.filter((n) => draw.numbers.includes(n)).length;
        hitsPerGame.push(hits);
        totalBets++;
        if (classifyHits(lottery, hits) !== null) prizeCount++;
      }
    }

    const meanHits =
      hitsPerGame.length === 0 ? 0 : hitsPerGame.reduce((a, b) => a + b, 0) / hitsPerGame.length;
    const prizeRate = totalBets === 0 ? 0 : prizeCount / totalBets;
    const { pValue, significant } = binomialExactTest(prizeCount, totalBets, p0);

    return {
      strategy,
      description: STRATEGY_DESCRIPTIONS[strategy],
      totalGames: hitsPerGame.length,
      totalBets,
      meanHits,
      expectedMeanHits: (rules.numbersDrawn * rules.numbersPerBet) / rules.numberUniverse,
      prizeRate,
      prizeCount,
      pValue,
      significantRaw: significant,
    };
  });

  const pValues = results.map((r) => r.pValue);
  const bonferroni = bonferroniCorrection(pValues);
  const bh = benjaminiHochberg(pValues);

  return {
    results,
    bonferroni: results.map((r, i) => ({ strategy: r.strategy, significant: bonferroni.significant[i] })),
    benjaminiHochberg: results.map((r, i) => ({ strategy: r.strategy, significant: bh.significant[i] })),
  };
}
