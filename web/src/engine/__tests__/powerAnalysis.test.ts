import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  anyPrizeProbability,
  currentPower,
  expectedHitsFor,
  hypergeometricStdDev,
  powerTable,
  requiredSampleSize,
} from '../powerAnalysis';
import { hypergeometricAtLeast } from '../hypergeometric';

describe('anyPrizeProbability', () => {
  it('Mega-Sena: qualquer prêmio começa na quadra (4 acertos)', () => {
    const p = anyPrizeProbability(Lottery.MEGA_SENA);
    expect(p).toBeCloseTo(hypergeometricAtLeast(60, 6, 6, 4), 15);
    // Chance oficial da Caixa de qualquer prêmio na Mega-Sena: 1 em 2.298.
    expect(1 / p).toBeGreaterThan(2_295);
    expect(1 / p).toBeLessThan(2_300);
  });

  it('Quina: qualquer prêmio começa no duque (2 acertos) — regressão do piso fixo', () => {
    const p = anyPrizeProbability(Lottery.QUINA);
    expect(p).toBeCloseTo(hypergeometricAtLeast(80, 5, 5, 2), 15);
    // REGRESSÃO: a versão anterior somava a partir de 4 acertos para todas as
    // modalidades, ignorando Duque e Terno e inflando o z do teste binomial.
    expect(p).toBeGreaterThan(hypergeometricAtLeast(80, 5, 5, 4));
  });

  it('+Milionária: qualquer prêmio inclui as faixas fixas (3 e 2 dezenas com trevo)', () => {
    const p = anyPrizeProbability(Lottery.MAIS_MILIONARIA);
    // Soma das dez faixas oficiais: ~8,78% — “1 vez a cada 11 apostas”.
    expect(p).toBeGreaterThan(0.087);
    expect(p).toBeLessThan(0.089);
    // REGRESSÃO: o piso fixo de 4 acertos omitia as faixas 7 a 10.
    expect(p).toBeGreaterThan(hypergeometricAtLeast(50, 6, 6, 4));
  });
});

describe('hypergeometricStdDev', () => {
  it('é positivo e finito para ambas as loterias', () => {
    expect(hypergeometricStdDev(Lottery.MEGA_SENA)).toBeGreaterThan(0);
    expect(hypergeometricStdDev(Lottery.MAIS_MILIONARIA)).toBeGreaterThan(0);
  });
});

describe('expectedHitsFor', () => {
  it('bate com os valores conhecidos de cada loteria', () => {
    expect(expectedHitsFor(Lottery.MEGA_SENA)).toBeCloseTo(0.6, 10);
    expect(expectedHitsFor(Lottery.MAIS_MILIONARIA)).toBeCloseTo(0.72, 10);
  });
});

describe('currentPower', () => {
  it('cresce com o tamanho da amostra', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const powerSmall = currentPower(std, 0.1, 40);
    const powerLarge = currentPower(std, 0.1, 5000);
    expect(powerLarge).toBeGreaterThan(powerSmall);
  });

  it('poder com 40 jogos é baixo para um efeito pequeno (confirma a advertência do documento)', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const power = currentPower(std, 0.1, 40);
    expect(power).toBeLessThan(0.3);
  });

  it('poder converge para perto de 1 com amostra muito grande', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const power = currentPower(std, 0.2, 100_000);
    expect(power).toBeGreaterThan(0.99);
  });

  it('devolve 0 para amostra vazia', () => {
    expect(currentPower(1, 0.1, 0)).toBe(0);
  });
});

describe('requiredSampleSize', () => {
  it('exige mais jogos para detectar efeitos menores', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const small = requiredSampleSize(std, 0.05);
    const large = requiredSampleSize(std, 0.2);
    expect(small.requiredGames).toBeGreaterThan(large.requiredGames);
  });

  it('o poder no tamanho de amostra recomendado atinge o alvo', () => {
    const std = hypergeometricStdDev(Lottery.MEGA_SENA);
    const { requiredGames } = requiredSampleSize(std, 0.1, 0.05, 0.8);
    const achievedPower = currentPower(std, 0.1, requiredGames);
    expect(achievedPower).toBeGreaterThanOrEqual(0.78); // tolerância pela aproximação numérica
  });
});

describe('powerTable', () => {
  it('gera uma linha por efeito e uma coluna por tamanho de amostra', () => {
    const table = powerTable(Lottery.MEGA_SENA, [0.1, 0.2], [100, 1000]);
    expect(table).toHaveLength(2);
    expect(table[0].powerBySampleSize).toHaveLength(2);
  });
});
