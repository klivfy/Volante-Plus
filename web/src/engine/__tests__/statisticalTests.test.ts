import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { hypergeometricProbability } from '../hypergeometric';
import { lotteryRules } from '../prizeRules';
import { binomialExactTest, chiSquareGoodnessOfFit } from '../statisticalTests';
import { anyPrizeProbability } from '../powerAnalysis';

describe('binomialExactTest', () => {
  it('não rejeita H0 quando observado bate exatamente com o esperado', () => {
    const p0 = 0.1;
    const trials = 1000;
    const result = binomialExactTest(p0 * trials, trials, p0);
    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.significant).toBe(false);
  });

  it('rejeita H0 para um desvio grande e uma amostra grande', () => {
    // 500 sucessos em 1000 tentativas contra p0 = 0.1 é um desvio enorme.
    const result = binomialExactTest(500, 1000, 0.1);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.significant).toBe(true);
  });

  it('devolve intervalo de confiança contendo a proporção observada', () => {
    const result = binomialExactTest(30, 100, 0.25);
    expect(result.ciLower).toBeLessThanOrEqual(0.3);
    expect(result.ciUpper).toBeGreaterThanOrEqual(0.3);
  });

  it('degenera com segurança para trials = 0', () => {
    const result = binomialExactTest(0, 0, 0.5);
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });

  it('p0 realista da Mega-Sena não rejeita um resultado equivalente ao acaso', () => {
    const p0 = anyPrizeProbability(Lottery.MEGA_SENA);
    // 40 apostas, número de prêmios igual ao esperado pelo acaso.
    const expectedPrizes = Math.round(p0 * 40);
    const result = binomialExactTest(expectedPrizes, 40, p0);
    expect(result.significant).toBe(false);
  });
});

describe('chiSquareGoodnessOfFit', () => {
  it('não rejeita quando a distribuição observada é a hipergeométrica exata', () => {
    // Contagens construídas diretamente das probabilidades teóricas (escala
    // arbitrária de 1e7) — por construção, chi2 deve ficar perto de 0.
    const rules = lotteryRules(Lottery.MEGA_SENA);
    const total = 10_000_000;
    const observed: Record<number, number> = {};
    for (let k = 0; k <= rules.numbersDrawn; k++) {
      observed[k] = Math.round(
        total *
          hypergeometricProbability(rules.numberUniverse, rules.numbersDrawn, rules.numbersPerBet, k),
      );
    }
    const result = chiSquareGoodnessOfFit(observed, Lottery.MEGA_SENA);
    expect(result.chi2).toBeLessThan(1);
    expect(result.significant).toBe(false);
  });

  it('rejeita uma distribuição claramente diferente da hipergeométrica', () => {
    const observed: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1000 };
    const result = chiSquareGoodnessOfFit(observed, Lottery.MEGA_SENA);
    expect(result.significant).toBe(true);
  });

  it('não lança para contagem total zero', () => {
    const result = chiSquareGoodnessOfFit({}, Lottery.MEGA_SENA);
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });
});
