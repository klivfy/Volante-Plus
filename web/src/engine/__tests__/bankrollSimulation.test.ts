import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { analyzeBacktest } from '../backtestAnalyzer';
import { monteCarloBankroll, simulateBankroll } from '../bankrollSimulation';
import { createSeededRandom } from '../random';
import { generateSyntheticHistory } from './fixtures';

const PRIZE_TABLE: Record<string, number> = { '6': 50_000_000, '5': 50_000, '4': 1_000 };

describe('simulateBankroll', () => {
  it('gasta pelo menos o custo total das apostas quando não falha', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 60, { seed: 41 });
    const performances = analyzeBacktest(history, Lottery.MEGA_SENA, 5);

    const result = simulateBankroll(
      { initialBankroll: 10_000, ticketCost: 5, gamesPerWeek: 2, weeks: 20, strategy: 'random-uniform' },
      history,
      Lottery.MEGA_SENA,
      performances,
      PRIZE_TABLE,
      createSeededRandom(1),
    );

    expect(result.totalSpent).toBe(5 * 2 * 20);
    expect(result.bankrupt).toBe(false);
  });

  it('declara falência quando a banca é menor que o custo semanal', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 10, { seed: 42 });
    const performances = analyzeBacktest(history, Lottery.MEGA_SENA, 5);

    const result = simulateBankroll(
      { initialBankroll: 5, ticketCost: 5, gamesPerWeek: 2, weeks: 10, strategy: 'random-uniform' },
      history,
      Lottery.MEGA_SENA,
      performances,
      PRIZE_TABLE,
      createSeededRandom(2),
    );

    expect(result.bankrupt).toBe(true);
    expect(result.finalBankroll).toBe(0);
    expect(result.maxDrawdown).toBe(1);
  });
});

describe('monteCarloBankroll', () => {
  it('devolve taxas dentro de [0, 1] e é reprodutível com a mesma seed', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 60, { seed: 43 });
    const performances = analyzeBacktest(history, Lottery.MEGA_SENA, 5);
    const scenario = {
      initialBankroll: 10_000,
      ticketCost: 5,
      gamesPerWeek: 2,
      weeks: 20,
      strategy: 'random-uniform' as const,
    };

    const a = monteCarloBankroll(scenario, history, Lottery.MEGA_SENA, performances, PRIZE_TABLE, 30, 100);
    const b = monteCarloBankroll(scenario, history, Lottery.MEGA_SENA, performances, PRIZE_TABLE, 30, 100);

    expect(a.bankruptcyRate).toBeGreaterThanOrEqual(0);
    expect(a.bankruptcyRate).toBeLessThanOrEqual(1);
    expect(a.probProfit).toBeGreaterThanOrEqual(0);
    expect(a).toEqual(b); // mesma seed -> mesmos resultados
  });

  it('devolve zeros para simulations = 0', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 20, { seed: 44 });
    const performances = analyzeBacktest(history, Lottery.MEGA_SENA, 5);
    const result = monteCarloBankroll(
      { initialBankroll: 100, ticketCost: 5, gamesPerWeek: 1, weeks: 5, strategy: 'random-uniform' },
      history,
      Lottery.MEGA_SENA,
      performances,
      PRIZE_TABLE,
      0,
    );
    expect(result).toEqual({
      bankruptcyRate: 0,
      meanFinalBankroll: 0,
      medianFinalBankroll: 0,
      probProfit: 0,
      probAnyPrize: 0,
    });
  });
});
