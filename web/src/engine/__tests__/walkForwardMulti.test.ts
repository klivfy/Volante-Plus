import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { multiCutWalkForward, stabilityAnalysis } from '../walkForwardMulti';
import { generateSyntheticHistory } from './fixtures';

describe('multiCutWalkForward', () => {
  it('devolve vazio para histórico vazio', () => {
    expect(multiCutWalkForward([], Lottery.MEGA_SENA)).toEqual([]);
  });

  it('gera pelo menos um corte com histórico suficiente (~6 anos, ~3/semana)', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 900, { seed: 1 });
    const results = multiCutWalkForward(
      history,
      Lottery.MEGA_SENA,
      { simulationRounds: 5 },
      { stepMonths: 6, minValidation: 20, firstCutoffYears: 4 },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const cut of results) {
      expect(cut.validationDraws).toBeGreaterThanOrEqual(20);
      expect(cut.pValue).toBeGreaterThanOrEqual(0);
      expect(cut.pValue).toBeLessThanOrEqual(1);
    }
  });

  it('não gera cortes quando o histórico é curto demais para a primeira janela', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 50, { seed: 2 });
    const results = multiCutWalkForward(history, Lottery.MEGA_SENA, {}, { firstCutoffYears: 4 });
    expect(results).toEqual([]);
  });
});

describe('stabilityAnalysis', () => {
  it('devolve zeros para lista vazia', () => {
    const result = stabilityAnalysis([]);
    expect(result.totalCuts).toBe(0);
    expect(result.consistency).toBe(0);
  });

  it('consistência é 1 quando todos os cortes têm o mesmo sinal', () => {
    const result = stabilityAnalysis([
      {
        cutoff: '2020-01-01',
        trainingDraws: 100,
        validationDraws: 20,
        meanHits: 0.7,
        expectedMeanHits: 0.6,
        prizeRate: 0.1,
        pValue: 0.5,
        significant: false,
      },
      {
        cutoff: '2020-06-01',
        trainingDraws: 130,
        validationDraws: 20,
        meanHits: 0.65,
        expectedMeanHits: 0.6,
        prizeRate: 0.1,
        pValue: 0.5,
        significant: false,
      },
    ]);
    expect(result.consistency).toBe(1);
    expect(result.meanAdvantage).toBeCloseTo(0.075, 10);
  });
});
