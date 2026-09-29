import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { betsForChance, chanceOfAtLeastOne, guaranteeProbability } from '../betPlanning';

describe('guaranteeProbability', () => {
  it('Mega-Sena, 10 dezenas, quadra: P(X ≥ 4) hipergeométrica', () => {
    // Σ_{k=4..6} C(10,k)C(50,6−k)/C(60,6) — conferido à mão
    const c = (n: number, k: number) => {
      let r = 1;
      for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
      return r;
    };
    const expected = [4, 5, 6].reduce((s, k) => s + c(10, k) * c(50, 6 - k), 0) / c(60, 6);
    expect(guaranteeProbability(Lottery.MEGA_SENA, 10, 4)).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(270060 / 50063860, 12); // 257250 + 12600 + 210 combinações
    expect(1 / expected).toBeCloseTo(185.4, 1);
  });
  it('cresce com o pool e cai com a garantia', () => {
    expect(guaranteeProbability(Lottery.MEGA_SENA, 15, 4)).toBeGreaterThan(
      guaranteeProbability(Lottery.MEGA_SENA, 10, 4),
    );
    expect(guaranteeProbability(Lottery.MEGA_SENA, 10, 3)).toBeGreaterThan(
      guaranteeProbability(Lottery.MEGA_SENA, 10, 4),
    );
  });
});

describe('chanceOfAtLeastOne / betsForChance', () => {
  it('são inversas', () => {
    const p = 1 / 50063860;
    const n = betsForChance(p, 0.5);
    expect(chanceOfAtLeastOne(p, n)).toBeGreaterThanOrEqual(0.5);
    expect(chanceOfAtLeastOne(p, n - 1)).toBeLessThan(0.5);
    expect(n).toBeGreaterThan(34_000_000); // ln 2 / p ≈ 34,7 mi
  });
  it('bordas', () => {
    expect(chanceOfAtLeastOne(0, 10)).toBe(0);
    expect(chanceOfAtLeastOne(1, 10)).toBe(1);
    expect(chanceOfAtLeastOne(0.5, 0)).toBe(0);
    expect(() => betsForChance(0, 0.5)).toThrow(RangeError);
    expect(() => betsForChance(0.1, 1)).toThrow(RangeError);
  });
});
