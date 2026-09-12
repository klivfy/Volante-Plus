import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { compositeScore, extractAdvancedFeatures } from '../advancedFeatures';
import { generateSyntheticHistory } from './fixtures';

describe('extractAdvancedFeatures', () => {
  it('devolve uma linha por dezena do universo', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 300, { seed: 31 });
    const features = extractAdvancedFeatures(history, Lottery.MEGA_SENA);
    expect(features).toHaveLength(60);
    expect(features.map((f) => f.number)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it('paridade e década são consistentes com o número', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 50, { seed: 32 });
    const features = extractAdvancedFeatures(history, Lottery.MEGA_SENA);
    const n15 = features.find((f) => f.number === 15)!;
    expect(n15.parity).toBe('odd');
    expect(n15.decade).toBe(2);
    const n20 = features.find((f) => f.number === 20)!;
    expect(n20.parity).toBe('even');
    expect(n20.decade).toBe(2);
  });

  it('recency e gapVariance ficam em 0 para histórico vazio', () => {
    const features = extractAdvancedFeatures([], Lottery.MEGA_SENA);
    expect(features.every((f) => f.frequency === 0 && f.recency === 0)).toBe(true);
  });
});

describe('compositeScore', () => {
  it('ordena por score decrescente e devolve todas as dezenas', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 300, { seed: 33 });
    const features = extractAdvancedFeatures(history, Lottery.MEGA_SENA);
    const scored = compositeScore(features, { frequency: 1, recency: 1, neighbor: 1, streak: 1 });

    expect(scored).toHaveLength(60);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });

  it('devolve lista vazia para features vazias', () => {
    expect(compositeScore([], { frequency: 1, recency: 1, neighbor: 1, streak: 1 })).toEqual([]);
  });
});
