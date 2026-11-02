import { Draw, Lottery, NumberPerformance } from '../types/domain';
import { gameSumWindow, hasConsecutivePair, parityWindow } from './batchMetrics';
import { analyzeBacktest } from './backtestAnalyzer';
import { generateGames } from './gameGenerator';
import { prizeProbabilityByNumbersAlone } from './powerAnalysis';
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
  | 'gap-maximizer'
  | 'sum-window'
  | 'parity-balanced'
  | 'no-consecutive';

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

export const STRATEGY_DESCRIPTIONS: Record<StrategyName, string> = {
  'tier-weighted': 'Método do app: 70% top / 20% mid / 10% low, ponderado por desempenho',
  'frequency-pure': 'Sempre as dezenas de um jogo historicamente mais frequentes',
  'cold-numbers': 'Favorece as dezenas menos frequentes ("atrasadas")',
  'random-uniform': 'Baseline: dezenas de um jogo uniformemente aleatórias (sem uso do histórico)',
  'gap-maximizer': 'Maximiza a distância mínima entre as dezenas escolhidas',
  'sum-window':
    'Filtro popular da internet: só jogos com soma na faixa central (média ± 1 σ) — medido, não adotado',
  'parity-balanced':
    'Filtro popular: equilíbrio de pares/ímpares na faixa modal — medido, não adotado',
  'no-consecutive':
    'Filtro popular: nenhum par de dezenas consecutivas no jogo — medido, não adotado',
};

/**
 * Amostragem por rejeição de um jogo uniforme que passa no filtro `accept`.
 *
 * WHY (o fallback "mais próximo"): os três filtros têm taxas de aceitação
 * altas (~68%, ~80% e ~58% num universo 6/60), então o teto de tentativas
 * só é atingido com probabilidade desprezível — mas o fallback determinístico
 * evita tanto o lançamento de erro quanto o retorno implícito de `undefined`
 * nesse caso limite; o benchmark continua com `count` jogos.
 *
 * A distribuição resultante é uniforme CONDICIONAL ao filtro. Como a chance
 * de prêmio é idêntica para todo bilhete (teorema da invariância), filtrar
 * estrutura não altera a taxa esperada — exatamente o que o benchmark deve
 * confirmar empiricamente para o usuário.
 */
function filteredUniformGame(
  lottery: Lottery,
  random: RandomSource,
  accept: (numbers: readonly number[]) => boolean,
  distance: (numbers: readonly number[]) => number,
  maxAttempts = 200,
): number[] {
  const rules = lotteryRules(lottery);
  const universe = Array.from({ length: rules.numberUniverse }, (_, i) => i + 1);
  let best: number[] = [];
  let bestDistance = Infinity;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = shuffleArray(universe, random)
      .slice(0, rules.numbersPerBet)
      .sort((a, b) => a - b);
    if (accept(candidate)) return candidate;
    const d = distance(candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

/** Distância de um valor a um intervalo fechado (0 quando dentro). */
function distanceToWindow(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return max - value;
  return 0;
}

/** Número de pares consecutivos no jogo (0 quando nenhum). */
function consecutivePairCount(numbers: readonly number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  let count = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) count++;
  }
  return count;
}

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
    case 'sum-window': {
      const window = gameSumWindow(lottery);
      const sumOf = (game: readonly number[]): number => game.reduce((sum, n) => sum + n, 0);
      return Array.from({ length: count }, () =>
        filteredUniformGame(
          lottery,
          random,
          (game) => {
            const sum = sumOf(game);
            return sum >= window.min && sum <= window.max;
          },
          (game) => distanceToWindow(sumOf(game), window.min, window.max),
        ),
      );
    }
    case 'parity-balanced': {
      const window = parityWindow(lottery);
      const oddsOf = (game: readonly number[]): number =>
        game.filter((n) => n % 2 === 1).length;
      return Array.from({ length: count }, () =>
        filteredUniformGame(
          lottery,
          random,
          (game) => {
            const odds = oddsOf(game);
            return odds >= window.min && odds <= window.max;
          },
          (game) => distanceToWindow(oddsOf(game), window.min, window.max),
        ),
      );
    }
    case 'no-consecutive': {
      return Array.from({ length: count }, () =>
        filteredUniformGame(
          lottery,
          random,
          (game) => !hasConsecutivePair(game),
          (game) => consecutivePairCount(game),
        ),
      );
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
  // O benchmark conta prêmios só por dezenas (`classifyHits(lottery, hits)`),
  // então o baseline tem de ser o da mesma unidade: na +Milionária,
  // `anyPrizeProbability` incluiria as faixas fixas dependentes de trevo e
  // inflaria a referência ~96× — ver `prizeProbabilityByNumbersAlone`.
  const p0 = prizeProbabilityByNumbersAlone(lottery);

  const strategies: StrategyName[] = [
    'tier-weighted',
    'frequency-pure',
    'cold-numbers',
    'random-uniform',
    'gap-maximizer',
    'sum-window',
    'parity-balanced',
    'no-consecutive',
  ];

  const results: StrategyResult[] = strategies.map((strategy) => {
    const hitsPerGame: number[] = [];
    let prizeCount = 0;
    let totalBets = 0;

    for (const draw of validation) {
      const games = generateForStrategy(strategy, lottery, performances, gamesPerContest, random);
      // Apostas idênticas dentro do concurso NÃO são Bernoulli independentes:
      // `frequency-pure` devolve o mesmo jogo `gamesPerContest` vezes e o
      // teste binomial tratava cada cópia como uma aposta — variância
      // subestimada por fator g, z inflado por √g. Contar só jogos distintos
      // por concurso restaura a unidade de independência do teste.
      const seen = new Set<string>();
      for (const numbers of games) {
        const key = numbers.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
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
