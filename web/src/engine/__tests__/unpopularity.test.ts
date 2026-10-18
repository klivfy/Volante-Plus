import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { isPrime, unpopularityPenalty } from '../unpopularity';

describe('isPrime', () => {
  it('classifica os primeiros primos corretamente', () => {
    expect([2, 3, 5, 7, 11, 13, 59].every(isPrime)).toBe(true);
  });

  it('rejeita não-primos e valores fora do domínio', () => {
    expect([0, 1, 4, 6, 9, 15, 60].some(isPrime)).toBe(false);
  });
});

describe('unpopularityPenalty', () => {
  it('é zero para uma lista vazia', () => {
    expect(unpopularityPenalty(Lottery.MEGA_SENA, [])).toBe(0);
  });

  it('penaliza mais uma combinação de datas de aniversário que uma dispersa', () => {
    // Todas <= 31, várias <= 12: o viés mais forte da literatura.
    const birthdays = [1, 5, 9, 12, 20, 31];
    // Dispersa, sem primos concentrados, sem alinhamento, sem o 7.
    const spread = [2, 18, 26, 34, 45, 58];

    expect(unpopularityPenalty(Lottery.MEGA_SENA, birthdays)).toBeGreaterThan(
      unpopularityPenalty(Lottery.MEGA_SENA, spread),
    );
  });

  it('penaliza uma progressão aritmética exata frente ao mesmo passo quebrado', () => {
    const arithmetic = [4, 10, 16, 22, 28, 34]; // passo constante de 6
    const brokenStep = [4, 10, 16, 22, 28, 35]; // um número desloca o passo
    expect(unpopularityPenalty(Lottery.MEGA_SENA, arithmetic)).toBeGreaterThan(
      unpopularityPenalty(Lottery.MEGA_SENA, brokenStep),
    );
  });

  it('penaliza consecutivos e alinhamento de coluna/linha do volante', () => {
    const consecutive = [40, 41, 34, 35, 22, 23]; // três pares consecutivos
    const scattered = [40, 44, 34, 38, 22, 26]; // mesmas dezenas de base, sem pares
    expect(unpopularityPenalty(Lottery.MEGA_SENA, consecutive)).toBeGreaterThan(
      unpopularityPenalty(Lottery.MEGA_SENA, scattered),
    );
  });

  it('nunca é negativa', () => {
    for (const numbers of [
      [1, 2, 3, 4, 5, 6],
      [55, 56, 57, 58, 59, 60],
      [7, 14, 21, 28, 35, 42],
    ]) {
      expect(unpopularityPenalty(Lottery.MEGA_SENA, numbers)).toBeGreaterThanOrEqual(0);
    }
  });

  it('respeita o universo da +Milionária (50 dezenas) para o centro', () => {
    // Não deve lançar nem produzir valores fora de faixa plausível.
    const value = unpopularityPenalty(Lottery.MAIS_MILIONARIA, [1, 10, 20, 30, 40, 50]);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('dezenas do concurso anterior reduzem a penalidade (recência)', () => {
    const game = [10, 15, 20, 25, 30, 35];
    const withoutRecency = unpopularityPenalty(Lottery.MEGA_SENA, game);
    const withRecency = unpopularityPenalty(Lottery.MEGA_SENA, game, [10, 15]);
    expect(withRecency).toBeLessThan(withoutRecency);
  });

  it('recência nunca torna a penalidade negativa', () => {
    const game = [1, 2, 3, 4, 5, 6];
    const value = unpopularityPenalty(Lottery.MEGA_SENA, game, [1, 2, 3, 4, 5, 6]);
    expect(value).toBeGreaterThanOrEqual(0);
  });
});
