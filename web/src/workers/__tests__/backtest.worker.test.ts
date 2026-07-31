import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import { computeBacktestAnalysis } from '../backtest.worker';

function draw(contestNumber: number, numbers: number[]): Draw {
  return { lottery: Lottery.MEGA_SENA, contestNumber, date: '2024-01-01', numbers };
}

describe('computeBacktestAnalysis', () => {
  it('devolve as performances de analyzeBacktest envolvidas em uma resposta de sucesso', () => {
    const draws = [draw(1, [1, 2, 3, 4, 5, 6]), draw(2, [1, 2, 3, 4, 5, 6])];

    const response = computeBacktestAnalysis({ draws, lottery: Lottery.MEGA_SENA, simulationsPerDraw: 0 });

    expect(response.type).toBe('success');
    if (response.type === 'success') {
      expect(response.performances).toHaveLength(60);
      expect(response.performances.find((p) => p.number === 1)?.hitCount).toBe(2);
    }
  });

  it('usa DEFAULT_SIMULATIONS_PER_NUMBER quando simulationsPerDraw não é informado', () => {
    const draws = [draw(1, [1, 2, 3, 4, 5, 6])];

    const response = computeBacktestAnalysis({ draws, lottery: Lottery.MEGA_SENA });

    expect(response.type).toBe('success');
  });

  it('devolve uma resposta de erro quando analyzeBacktest lança', () => {
    // @ts-expect-error loteria inválida de propósito, para exercitar o branch de erro
    const response = computeBacktestAnalysis({ draws: [], lottery: 'inexistente' });

    expect(response.type).toBe('error');
    if (response.type === 'error') {
      expect(response.message).toContain('Loteria desconhecida');
    }
  });
});
