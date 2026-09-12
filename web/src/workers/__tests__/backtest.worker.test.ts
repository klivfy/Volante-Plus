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
      expect(response.trevoPerformances).toEqual([]);
    }
  });

  it('inclui trevoPerformances para loterias com trevos', () => {
    const draws = [
      { lottery: Lottery.MAIS_MILIONARIA, contestNumber: 1, date: '2024-01-01', numbers: [1, 2, 3, 4, 5, 6], trevos: [1, 2] },
    ];

    const response = computeBacktestAnalysis({ draws, lottery: Lottery.MAIS_MILIONARIA, simulationsPerDraw: 0 });

    expect(response.type).toBe('success');
    if (response.type === 'success') {
      expect(response.trevoPerformances).toHaveLength(6);
      expect(response.trevoPerformances.find((p) => p.number === 1)?.hitCount).toBe(1);
    }
  });

  it('usa DEFAULT_SIMULATIONS_PER_NUMBER quando simulationsPerDraw não é informado', () => {
    const draws = [draw(1, [1, 2, 3, 4, 5, 6])];

    const response = computeBacktestAnalysis({ draws, lottery: Lottery.MEGA_SENA });

    expect(response.type).toBe('success');
  });

  it('devolve o relatório completo para uma requisição kind: backtest', () => {
    const training = [draw(1, [1, 2, 3, 4, 5, 6]), draw(2, [1, 2, 3, 4, 5, 6])];
    const validation = [draw(3, [1, 2, 3, 4, 5, 6])];

    const response = computeBacktestAnalysis({
      kind: 'backtest',
      lottery: Lottery.MEGA_SENA,
      trainingDraws: training,
      validationDraws: validation,
      gamesPerContest: 2,
      seed: 42,
    });

    expect(response.type).toBe('report');
    if (response.type === 'report') {
      expect(response.report.trainingDraws).toBe(2);
      expect(response.report.validationDraws).toBe(1);
      expect(response.report.totalGames).toBe(2);
      expect(response.report.performances).toHaveLength(60);
    }
  });

  it('devolve erro quando o backtest não tem concursos de validação', () => {
    const response = computeBacktestAnalysis({
      kind: 'backtest',
      lottery: Lottery.MEGA_SENA,
      trainingDraws: [draw(1, [1, 2, 3, 4, 5, 6])],
      validationDraws: [],
    });

    expect(response.type).toBe('error');
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
