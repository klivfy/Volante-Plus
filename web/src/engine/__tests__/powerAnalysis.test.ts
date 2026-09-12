import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  currentPower,
  expectedHitsFor,
  hypergeometricStdDev,
  powerTable,
  requiredSampleSize,
} from '../powerAnalysis';

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
