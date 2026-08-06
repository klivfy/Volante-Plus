import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { generateForStrategy, runStrategyBenchmark, StrategyName } from '../strategyBenchmark';
import { analyzeBacktest } from '../backtestAnalyzer';
import { createSeededRandom } from '../random';
import { generateSyntheticHistory } from './fixtures';

const STRATEGIES: StrategyName[] = [
  'tier-weighted',
  'frequency-pure',
  'cold-numbers',
  'random-uniform',
  'gap-maximizer',
];

describe('generateForStrategy', () => {
  it('cada estratégia produz jogos válidos (6 dezenas distintas, ordenadas)', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 100, { seed: 3 });
    const performances = analyzeBacktest(history, Lottery.MEGA_SENA, 5);
    const random = createSeededRandom(7);

    for (const strategy of STRATEGIES) {
      const games = generateForStrategy(strategy, Lottery.MEGA_SENA, performances, 3, random);
      expect(games).toHaveLength(3);
      for (const game of games) {
        expect(game).toHaveLength(6);
        expect(new Set(game).size).toBe(6);
        expect([...game]).toEqual([...game].sort((a, b) => a - b));
        expect(game.every((n) => n >= 1 && n <= 60)).toBe(true);
      }
    }
  });

  it("'frequency-pure' repete sempre o mesmo jogo", () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 100, { seed: 4 });
    const performances = analyzeBacktest(history, Lottery.MEGA_SENA, 5);
    const random = createSeededRandom(9);
    const games = generateForStrategy('frequency-pure', Lottery.MEGA_SENA, performances, 3, random);
    expect(games[0]).toEqual(games[1]);
    expect(games[1]).toEqual(games[2]);
  });
});

describe('runStrategyBenchmark', () => {
  it('roda todas as estratégias e devolve p-values e correções válidas', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 150, { seed: 5 });
    const training = history.slice(0, 120);
    const validation = history.slice(120);

    const benchmark = runStrategyBenchmark(training, validation, Lottery.MEGA_SENA, {
      gamesPerContest: 2,
      simulationRounds: 5,
      seed: 11,
    });

    expect(benchmark.results).toHaveLength(5);
    expect(benchmark.bonferroni).toHaveLength(5);
    expect(benchmark.benjaminiHochberg).toHaveLength(5);

    for (const row of benchmark.results) {
      expect(row.pValue).toBeGreaterThanOrEqual(0);
      expect(row.pValue).toBeLessThanOrEqual(1);
      expect(row.totalBets).toBeGreaterThan(0);
    }
  });

  it('sob sorteio sintético uniforme, nenhuma estratégia deveria ficar significativa após Bonferroni', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 150, { seed: 6 });
    const training = history.slice(0, 120);
    const validation = history.slice(120);

    const benchmark = runStrategyBenchmark(training, validation, Lottery.MEGA_SENA, {
      simulationRounds: 5,
      seed: 13,
    });

    const anySignificant = benchmark.bonferroni.some((entry) => entry.significant);
    // Não é garantido matematicamente (é um teste sobre uma amostra sintética
    // específica), mas é o resultado esperado sob a hipótese nula — e serve
    // de sentinela contra uma regressão que "descubra" vantagem artificial.
    expect(anySignificant).toBe(false);
  });
});
