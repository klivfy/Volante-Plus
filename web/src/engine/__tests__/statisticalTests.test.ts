import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { hypergeometricProbability } from '../hypergeometric';
import { lotteryRules } from '../prizeRules';
import {
  approxChi2CDF,
  approxChi2Survival,
  binomialExactTest,
  chiSquareGoodnessOfFit,
} from '../statisticalTests';
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

  it('funde as caudas esparsas: um "6 acertos" raro não é mais um falso positivo (Onda 3)', () => {
    // 500 jogos na Mega-Sena: esperado de 6 acertos é 500/50.063.860 ≈ 0,01.
    // Antes da fusão de Cochran, UMA observação nessa casela produzia
    // χ² ~ 98 e "método ≠ acaso" — o teste media raridade, não desvio.
    const rules = lotteryRules(Lottery.MEGA_SENA);
    const total = 500;
    const observed: Record<number, number> = {};
    for (let k = 0; k <= rules.numbersDrawn; k++) {
      observed[k] = Math.floor(
        total *
          hypergeometricProbability(rules.numberUniverse, rules.numbersDrawn, rules.numbersPerBet, k),
      );
    }
    observed[6] = 1; // o jogador sortudo — sob H0 isso acontece.

    const result = chiSquareGoodnessOfFit(observed, Lottery.MEGA_SENA);
    expect(result.significant).toBe(false);
    // A cauda alta foi fundida numa única casela (o último bin tem vários ks).
    expect(result.bins[result.bins.length - 1].length).toBeGreaterThan(1);
    expect(result.bins[result.bins.length - 1]).toContain(rules.numbersDrawn);
  });

  it('mantém o poder: desvio de distribuição real continua sendo rejeitado', () => {
    const observed: Record<number, number> = { 0: 250, 1: 150, 2: 80, 3: 15, 4: 5, 5: 0, 6: 0 };
    const result = chiSquareGoodnessOfFit(observed, Lottery.MEGA_SENA);
    expect(result.significant).toBe(true);
  });

  it('preserva a magnitude do p-valor para χ² grande (cauda superior direta)', () => {
    const result = chiSquareGoodnessOfFit(
      { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1000 },
      Lottery.MEGA_SENA,
    );
    // O caminho antigo (1 - CDF) devolvia 0 por cancelamento catastrófico.
    expect(result.pValue).toBeLessThan(1e-10);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
  });

  it('approxChi2Survival mantém a magnitude onde 1 - CDF colapsa em zero', () => {
    // χ² = 400 com df = 3: z ≈ 15,4, p real ≈ 1e-53. O antigo `1 - CDF`
    // devolvia exatamente 0 (1 − (1 − ε) perde ε abaixo de ~1e-16); a cauda
    // direta preserva a ordem de grandeza até o underflow de exp (z ≈ 38).
    const survival = approxChi2Survival(400, 3);
    const viaCdf = 1 - approxChi2CDF(400, 3);
    expect(survival).toBeGreaterThan(0);
    expect(survival).toBeLessThan(1e-30);
    expect(viaCdf).toBe(0);
  });
});
