import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  binomial,
  expectedNumberHits,
  expectedPrizes,
  hypergeometricAtLeast,
  hypergeometricMean,
  hypergeometricProbability,
  prizeProbabilities,
} from '../hypergeometric';
import { MAIS_MILIONARIA_TIERS, MEGA_SENA_TIERS, classifyHits, isPrized } from '../prizeRules';

const MEGA_COMBINATIONS = 50_063_860; // C(60,6)
const MILIONARIA_COMBINATIONS = 15_890_700; // C(50,6)

describe('binomial', () => {
  it('reproduz os coeficientes conhecidos das loterias', () => {
    expect(binomial(60, 6)).toBe(MEGA_COMBINATIONS);
    expect(binomial(50, 6)).toBe(MILIONARIA_COMBINATIONS);
    expect(binomial(6, 2)).toBe(15);
  });

  it('devolve 0 fora do domínio', () => {
    expect(binomial(6, 7)).toBe(0);
    expect(binomial(-1, 0)).toBe(0);
    expect(binomial(6, 1.5)).toBe(0);
  });
});

describe('hypergeometricProbability', () => {
  it('calcula a chance de sena da Mega-Sena', () => {
    expect(hypergeometricProbability(60, 6, 6, 6)).toBeCloseTo(1 / MEGA_COMBINATIONS, 15);
  });

  it('calcula quina e quadra', () => {
    // C(6,5) * C(54,1) / C(60,6)
    expect(hypergeometricProbability(60, 6, 6, 5)).toBeCloseTo(324 / MEGA_COMBINATIONS, 12);
    // C(6,4) * C(54,2) / C(60,6)
    expect(hypergeometricProbability(60, 6, 6, 4)).toBeCloseTo(21_465 / MEGA_COMBINATIONS, 12);
  });

  it('soma 1 sobre todo o suporte', () => {
    let total = 0;
    for (let k = 0; k <= 6; k++) {
      total += hypergeometricProbability(60, 6, 6, k);
    }
    expect(total).toBeCloseTo(1, 12);
  });

  it('devolve 0 para k fora do suporte, sem lançar', () => {
    expect(hypergeometricProbability(60, 6, 6, 7)).toBe(0);
    expect(hypergeometricProbability(60, 6, 6, -1)).toBe(0);
    // n - k = 10 > N - K = 4: impossível preencher as vagas restantes.
    expect(hypergeometricProbability(6, 2, 6, 0)).toBe(0);
  });

  it('rejeita populações inválidas', () => {
    expect(() => hypergeometricProbability(60, 61, 6, 1)).toThrow(RangeError);
    expect(() => hypergeometricProbability(60, 6, 61, 1)).toThrow(RangeError);
    expect(() => hypergeometricProbability(-1, 0, 0, 0)).toThrow(RangeError);
    expect(() => hypergeometricProbability(60, 6, 6, 1.5)).toThrow(RangeError);
  });

  it('modela o sorteio de trevos (N=6, K=2, n=2)', () => {
    expect(hypergeometricProbability(6, 2, 2, 2)).toBeCloseTo(1 / 15, 12);
    expect(hypergeometricProbability(6, 2, 2, 1)).toBeCloseTo(8 / 15, 12);
    expect(hypergeometricProbability(6, 2, 2, 0)).toBeCloseTo(6 / 15, 12);
  });
});

describe('hypergeometricAtLeast', () => {
  it('acumula a cauda superior', () => {
    const atLeastFour =
      hypergeometricProbability(60, 6, 6, 4) +
      hypergeometricProbability(60, 6, 6, 5) +
      hypergeometricProbability(60, 6, 6, 6);
    expect(hypergeometricAtLeast(60, 6, 6, 4)).toBeCloseTo(atLeastFour, 15);
  });

  it('vale 1 a partir de k = 0', () => {
    expect(hypergeometricAtLeast(60, 6, 6, 0)).toBeCloseTo(1, 12);
  });
});

describe('hypergeometricMean', () => {
  it('devolve n * K / N', () => {
    expect(hypergeometricMean(60, 6, 6)).toBeCloseTo(0.6, 12);
    expect(expectedNumberHits(Lottery.MEGA_SENA)).toBeCloseTo(0.6, 12);
    expect(expectedNumberHits(Lottery.MAIS_MILIONARIA)).toBeCloseTo(0.72, 12);
  });
});

describe('prizeProbabilities', () => {
  it('cobre exatamente as faixas da Mega-Sena', () => {
    const probabilities = prizeProbabilities(Lottery.MEGA_SENA);
    expect(Object.keys(probabilities).sort()).toEqual(['4', '5', '6']);
    expect(probabilities['6']).toBeCloseTo(1 / MEGA_COMBINATIONS, 15);
  });

  it('cobre as dez faixas oficiais da +Milionária', () => {
    const probabilities = prizeProbabilities(Lottery.MAIS_MILIONARIA);
    expect(Object.keys(probabilities)).toHaveLength(10);
    // Chance oficial de 6 dezenas + 2 trevos: 1 em 238.360.500.
    expect(probabilities['6+2']).toBeCloseTo(1 / 238_360_500, 15);
    // Soma de todas as faixas = chance de prêmio oficial: 1 em 11,39.
    const anyPrize = Object.values(probabilities).reduce((sum, p) => sum + p, 0);
    expect(1 / anyPrize).toBeCloseTo(11.39, 2);
  });

  it('reparte a faixa de 6 dezenas entre 2 e (1 ou 0) trevos', () => {
    const p = prizeProbabilities(Lottery.MAIS_MILIONARIA);
    const seis = p['6+2'] + p['6+1/0'];
    expect(seis).toBeCloseTo(1 / MILIONARIA_COMBINATIONS, 15);
  });
});

describe('expectedPrizes', () => {
  it('escala linearmente com a quantidade de apostas', () => {
    const one = expectedPrizes(1, Lottery.MEGA_SENA);
    const five = expectedPrizes(5, Lottery.MEGA_SENA);
    for (const key of Object.keys(one)) {
      expect(five[key]).toBeCloseTo(one[key] * 5, 18);
    }
  });

  it('zera para nenhuma aposta', () => {
    const none = expectedPrizes(0, Lottery.MAIS_MILIONARIA);
    expect(Object.values(none).every((value) => value === 0)).toBe(true);
  });

  it('rejeita contagens inválidas', () => {
    expect(() => expectedPrizes(-1, Lottery.MEGA_SENA)).toThrow(RangeError);
    expect(() => expectedPrizes(2.5, Lottery.MEGA_SENA)).toThrow(RangeError);
  });
});

describe('prizeRules', () => {
  it('lista as faixas da mais alta para a mais baixa', () => {
    expect(MEGA_SENA_TIERS.map((tier) => tier.key)).toEqual(['6', '5', '4']);
    expect(MAIS_MILIONARIA_TIERS).toHaveLength(10);
  });

  it('classifica acertos na faixa correta', () => {
    expect(classifyHits(Lottery.MEGA_SENA, 6)?.label).toBe('Sena');
    expect(classifyHits(Lottery.MEGA_SENA, 3)).toBeNull();
    expect(classifyHits(Lottery.MAIS_MILIONARIA, 5, 1)?.key).toBe('5+1/0');
    expect(classifyHits(Lottery.MAIS_MILIONARIA, 5, 0)?.key).toBe('5+1/0');
    expect(classifyHits(Lottery.MAIS_MILIONARIA, 3, 2)?.key).toBe('3+2');
    expect(classifyHits(Lottery.MAIS_MILIONARIA, 2, 1)?.key).toBe('2+1');
    expect(classifyHits(Lottery.MAIS_MILIONARIA, 1, 2)).toBeNull();
  });

  it('ignora os trevos numa loteria sem trevos', () => {
    expect(isPrized(Lottery.MEGA_SENA, 4, 2)).toBe(true);
  });
});
