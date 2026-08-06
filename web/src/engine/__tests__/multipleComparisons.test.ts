import { describe, expect, it } from 'vitest';
import { benjaminiHochberg, bonferroniCorrection } from '../multipleComparisons';

describe('bonferroniCorrection', () => {
  it('divide alpha pelo número de testes', () => {
    const result = bonferroniCorrection([0.01, 0.02, 0.5], 0.05);
    expect(result.correctedAlpha).toBeCloseTo(0.05 / 3, 10);
    // alpha corrigido ≈ 0.0167: só 0.01 fica abaixo, 0.02 e 0.5 não.
    expect(result.significant).toEqual([true, false, false]);
  });

  it('rejeita quando o p-value é bem menor que o alpha corrigido', () => {
    const result = bonferroniCorrection([0.001, 0.5, 0.8], 0.05);
    expect(result.significant[0]).toBe(true);
    expect(result.rejected).toBe(1);
  });

  it('lida com lista vazia', () => {
    const result = bonferroniCorrection([]);
    expect(result.rejected).toBe(0);
    expect(result.significant).toEqual([]);
  });
});

describe('benjaminiHochberg', () => {
  it('é sempre pelo menos tão permissiva quanto Bonferroni', () => {
    const pValues = [0.001, 0.01, 0.03, 0.2, 0.5];
    const bonferroni = bonferroniCorrection(pValues);
    const bh = benjaminiHochberg(pValues);
    expect(bh.rejected).toBeGreaterThanOrEqual(bonferroni.rejected);
  });

  it('não rejeita nada quando todos os p-values são altos', () => {
    const result = benjaminiHochberg([0.3, 0.5, 0.8, 0.9]);
    expect(result.rejected).toBe(0);
    expect(result.significant.every((s) => s === false)).toBe(true);
  });

  it('lida com lista vazia', () => {
    const result = benjaminiHochberg([]);
    expect(result.rejected).toBe(0);
    expect(result.threshold).toBe(0);
  });
});
