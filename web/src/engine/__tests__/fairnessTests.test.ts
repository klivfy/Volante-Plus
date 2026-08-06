import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import { frequencyFairnessTest, gapTest, serialCorrelationTest } from '../fairnessTests';
import { generateSyntheticHistory } from './fixtures';

describe('frequencyFairnessTest', () => {
  it('sorteio sintético uniforme não rejeita a hipótese de justiça', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 2000, { seed: 21 });
    const result = frequencyFairnessTest(history, Lottery.MEGA_SENA);
    expect(result.isFair).toBe(true);
  });

  it('detecta um enviesamento grosseiro (mesmas 6 dezenas sempre)', () => {
    const biased: Draw[] = Array.from({ length: 200 }, (_, i) => ({
      lottery: Lottery.MEGA_SENA,
      contestNumber: i + 1,
      date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
      numbers: [1, 2, 3, 4, 5, 6],
    }));
    const result = frequencyFairnessTest(biased, Lottery.MEGA_SENA);
    expect(result.isFair).toBe(false);
  });

  it('devolve resultado neutro para histórico vazio', () => {
    const result = frequencyFairnessTest([], Lottery.MEGA_SENA);
    expect(result.isFair).toBe(true);
    expect(result.pValue).toBe(1);
  });
});

describe('gapTest', () => {
  it('devolve uma linha por dezena com aparições suficientes', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 500, { seed: 22 });
    const rows = gapTest(history, Lottery.MEGA_SENA);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.number).toBeGreaterThanOrEqual(1);
      expect(row.number).toBeLessThanOrEqual(60);
      expect(row.meanGap).toBeGreaterThan(0);
    }
  });
});

describe('serialCorrelationTest', () => {
  it('sorteio sintético independente não mostra autocorrelação significativa', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 1000, { seed: 23 });
    const result = serialCorrelationTest(history, Lottery.MEGA_SENA);
    expect(result.isRandom).toBe(true);
    expect(Math.abs(result.lag1Correlation)).toBeLessThan(0.2);
  });

  it('degenera com segurança para histórico curto demais', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 1, { seed: 24 });
    const result = serialCorrelationTest(history, Lottery.MEGA_SENA);
    expect(result.isRandom).toBe(true);
    expect(result.lag1Correlation).toBe(0);
  });
});
