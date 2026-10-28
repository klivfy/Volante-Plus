import { describe, expect, it } from 'vitest';
import {
  applyWheel,
  generateWheelGreedy,
  verifyWheelCoverage,
  WHEEL_10_6_4,
} from '../wheelingSystems';

describe('applyWheel', () => {
  it('mapeia as posições abstratas para as dezenas do usuário', () => {
    const userNumbers = [10, 20, 30, 40, 50, 60, 5, 15, 25, 35];
    const games = applyWheel(WHEEL_10_6_4, userNumbers);
    expect(games).toHaveLength(WHEEL_10_6_4.length);
    for (const game of games) {
      expect(game).toHaveLength(6);
      expect(game.every((n) => userNumbers.includes(n))).toBe(true);
    }
  });

  it('rejeita menos de 10 dezenas', () => {
    expect(() => applyWheel(WHEEL_10_6_4, [1, 2, 3])).toThrow(RangeError);
  });
});

describe('verifyWheelCoverage', () => {
  it('garante quadra quando 4 das 10 dezenas do pool saem no sorteio', () => {
    const userNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const games = applyWheel(WHEEL_10_6_4, userNumbers);

    // Testa exaustivamente todas as combinações de 4 dezenas do pool.
    for (let a = 0; a < 10; a++) {
      for (let b = a + 1; b < 10; b++) {
        for (let c = b + 1; c < 10; c++) {
          for (let d = c + 1; d < 10; d++) {
            const draw = [userNumbers[a], userNumbers[b], userNumbers[c], userNumbers[d]];
            expect(verifyWheelCoverage(games, userNumbers, draw, 4)).toBe(true);
          }
        }
      }
    }
  });

  it('não se aplica quando o sorteio não atinge a garantia no pool', () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const draw = [1, 2, 99, 98, 97, 96]; // só 2 dezenas do pool
    expect(verifyWheelCoverage(WHEEL_10_6_4, pool, draw, 4)).toBe(true); // garantia inaplicável
  });
});

describe('generateWheelGreedy', () => {
  it('cobre todas as combinações-alvo de um pool pequeno', () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8];
    const wheel = generateWheelGreedy(pool, 6, 4);
    expect(wheel.length).toBeGreaterThan(0);

    // Toda combinação de 4 dezenas do pool deve estar contida em algum jogo.
    for (let a = 0; a < pool.length; a++) {
      for (let b = a + 1; b < pool.length; b++) {
        for (let c = b + 1; c < pool.length; c++) {
          for (let d = c + 1; d < pool.length; d++) {
            const combo = [pool[a], pool[b], pool[c], pool[d]];
            const covered = wheel.some((game) => combo.every((n) => game.includes(n)));
            expect(covered).toBe(true);
          }
        }
      }
    }
  });

  it('rejeita pools grandes demais (proteção de performance)', () => {
    const pool = Array.from({ length: 13 }, (_, i) => i + 1);
    expect(() => generateWheelGreedy(pool, 6, 4)).toThrow(RangeError);
  });

  it('rejeita garantia maior que o tamanho do jogo', () => {
    expect(() => generateWheelGreedy([1, 2, 3, 4, 5, 6], 6, 7)).toThrow(RangeError);
  });
});

describe('guards de entrada (Onda 5)', () => {
  it('applyWheel rejeita mais de 10 dezenas em vez de truncar em silêncio', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => i + 1);
    // Truncar usaria só as 10 menores e a "garantia de quadra" exibida não
    // cobriria a 11ª dezena marcada — tem de ser erro explícito.
    expect(() => applyWheel(WHEEL_10_6_4, eleven)).toThrow(RangeError);
  });

  it('generateWheelGreedy rejeita gameSize maior que o pool (wheel vazio "com garantia")', () => {
    // Antes: combinations([], 6) = [] → devolvia 0 jogos como se cobrisse.
    expect(() => generateWheelGreedy([1, 2, 3, 4, 5], 6, 3)).toThrow(RangeError);
  });

  it('rejeita garantia e tamanho de jogo não positivos ou fracionários', () => {
    // Garantia 0 "crescia" o combo vazio com 1 jogo; gameSize fracionário
    // produzia combinações sem sentido — inputs impossíveis lançam.
    expect(() => generateWheelGreedy([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 6, 0)).toThrow(RangeError);
    expect(() => generateWheelGreedy([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0, 1)).toThrow(RangeError);
    expect(() => generateWheelGreedy([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 6.5, 2)).toThrow(RangeError);
  });

  it('applyWheel exige 10 dezenas DISTINTAS: repetição não cobre o wheel', () => {
    // Exatamente 10 marcadas, mas só 5 distintas: a duplicata vazaria para os
    // jogos e um jogo "de 6" sairia com menos de 6 dezenas distintas — a
    // garantia combinatória deixaria de valer.
    expect(() => applyWheel(WHEEL_10_6_4, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])).toThrow(RangeError);
  });

  it('applyWheel mantém as 10 dezenas distintas mapeadas sem duplicar jogos', () => {
    const userNumbers = [7, 3, 9, 1, 8, 2, 10, 4, 6, 5];
    const games = applyWheel(WHEEL_10_6_4, userNumbers);
    for (const game of games) {
      expect(new Set(game).size).toBe(6); // 6 dezenas distintas por jogo
    }
  });
});
