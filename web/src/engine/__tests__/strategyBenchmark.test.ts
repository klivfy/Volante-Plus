import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  generateForStrategy,
  runStrategyBenchmark,
  StrategyName,
  STRATEGY_DESCRIPTIONS,
} from '../strategyBenchmark';
import { gameSumWindow, hasConsecutivePair, parityWindow } from '../batchMetrics';
import { analyzeBacktest } from '../backtestAnalyzer';
import { createSeededRandom } from '../random';
import { generateSyntheticHistory } from './fixtures';

const STRATEGIES: StrategyName[] = [
  'tier-weighted',
  'frequency-pure',
  'cold-numbers',
  'random-uniform',
  'gap-maximizer',
  'sum-window',
  'parity-balanced',
  'no-consecutive',
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

    expect(benchmark.results).toHaveLength(8);
    expect(benchmark.bonferroni).toHaveLength(8);
    expect(benchmark.benjaminiHochberg).toHaveLength(8);

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

describe('estratégias de filtro de estrutura (varredura de modelos populares)', () => {
  const history = generateSyntheticHistory(Lottery.MEGA_SENA, 100, { seed: 8 });
  const performances = analyzeBacktest(history, Lottery.MEGA_SENA, 5);
  const random = createSeededRandom(21);

  it("'sum-window': todo jogo fica na faixa central (média ± 1 σ)", () => {
    const window = gameSumWindow(Lottery.MEGA_SENA);
    const games = generateForStrategy('sum-window', Lottery.MEGA_SENA, performances, 12, random);
    expect(games).toHaveLength(12);
    for (const game of games) {
      const sum = game.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThanOrEqual(window.min);
      expect(sum).toBeLessThanOrEqual(window.max);
    }
  });

  it("'parity-balanced': contagem de ímpares dentro da faixa modal", () => {
    const window = parityWindow(Lottery.MEGA_SENA);
    const games = generateForStrategy(
      'parity-balanced',
      Lottery.MEGA_SENA,
      performances,
      12,
      random,
    );
    expect(games).toHaveLength(12);
    for (const game of games) {
      const odds = game.filter((n) => n % 2 === 1).length;
      expect(odds).toBeGreaterThanOrEqual(window.min);
      expect(odds).toBeLessThanOrEqual(window.max);
    }
  });

  it("'no-consecutive': nenhum par consecutivo em nenhum jogo", () => {
    const games = generateForStrategy(
      'no-consecutive',
      Lottery.MEGA_SENA,
      performances,
      12,
      random,
    );
    expect(games).toHaveLength(12);
    for (const game of games) {
      expect(hasConsecutivePair(game)).toBe(false);
    }
  });

  it('descrições cobrem todas as estratégias do tipo (Record exaustivo)', () => {
    for (const strategy of STRATEGIES) {
      expect(STRATEGY_DESCRIPTIONS[strategy].length).toBeGreaterThan(0);
    }
  });

  it('filtros valem para as três modalidades (jogos válidos na Quina e +Milionária)', () => {
    // Os filtros de estrutura são independentes do histórico — o desempenho
    // uniforme inline deixa isso explícito (e evita depender da fixture,
    // que só modela universos 6/60 e 6/50).
    for (const lottery of [Lottery.QUINA, Lottery.MAIS_MILIONARIA]) {
      const perGame = lottery === Lottery.QUINA ? 5 : 6;
      const universe = lottery === Lottery.QUINA ? 80 : 50;
      const uniform = Array.from({ length: universe }, (_, i) => ({
        number: i + 1,
        hitCount: 0,
        simulatedHitRate: 0,
        weight: 1,
        tier: 'mid' as const,
      }));
      for (const strategy of ['sum-window', 'parity-balanced', 'no-consecutive'] as StrategyName[]) {
        const games = generateForStrategy(strategy, lottery, uniform, 4, random);
        expect(games).toHaveLength(4);
        for (const game of games) {
          expect(game).toHaveLength(perGame);
          expect(new Set(game).size).toBe(perGame);
          expect(game.every((n) => n >= 1 && n <= universe)).toBe(true);
        }
      }
    }
  });
});
