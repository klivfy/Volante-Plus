import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  SIMPLE_BET_PRICE_BRL,
  closureCost,
  closureHoldsFor,
  designClosure,
  generateClosure,
  offeredGuarantees,
  verifyClosure,
} from '../closureDesigner';
import { createSeededRandom } from '../random';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('designClosure — cobertura exaustiva', () => {
  // Cada tamanho de pool da Mega-Sena, garantia de quadra e de terno.
  for (const v of [7, 8, 9, 10, 11, 12, 13, 14, 15]) {
    for (const t of [3, 4]) {
      it(`C(${v},6,${t}) cobre todos os subconjuntos de ${t} dezenas`, () => {
        const pool = range(1, v).map((n) => n * 3); // dezenas "reais", não 1..v
        const design = designClosure(pool, 6, t);
        expect(verifyClosure(design, pool)).toBe(true);
        expect(design.games.every((g) => g.length === 6 && new Set(g).size === 6)).toBe(true);
        expect(design.games.every((g) => g.every((n) => pool.includes(n)))).toBe(true);
      });
    }
  }

  it('não usa mais jogos do que o desdobramento completo C(v,6)', () => {
    const design = designClosure(range(1, 10), 6, 4);
    expect(design.games.length).toBeLessThan(210);
    // 20 é a melhor cota conhecida de C(10,6,4): o projeto tem que igualá-la.
    expect(design.games.length).toBeLessThanOrEqual(20);
  });

  it('o desempate por penalidade não quebra a garantia', () => {
    const pool = range(1, 11);
    const design = designClosure(pool, 6, 4, (numbers) => numbers.reduce((s, n) => s + n, 0));
    expect(verifyClosure(design, pool)).toBe(true);
  });

  it('verifyClosure reprova um fechamento incompleto', () => {
    const pool = range(1, 10);
    const design = designClosure(pool, 6, 4);
    expect(verifyClosure({ ...design, games: design.games.slice(1) }, pool)).toBe(false);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => designClosure([1, 2, 3, 4, 5, 6], 6, 4)).toThrow(RangeError);
    expect(() => designClosure([1, 1, 2, 3, 4, 5, 6], 6, 4)).toThrow(RangeError);
    expect(() => designClosure(range(1, 16), 6, 4)).toThrow(RangeError);
    expect(() => designClosure(range(1, 10), 6, 6)).toThrow(RangeError);
  });
});

describe('generateClosure', () => {
  it('a garantia vale contra sorteios reais simulados (Mega-Sena)', () => {
    const random = createSeededRandom(5);
    const pool = [3, 9, 14, 21, 27, 33, 38, 44, 51, 58];
    const batch = generateClosure(Lottery.MEGA_SENA, pool, 4, { random });
    expect(batch.closure?.guarantee).toBe(4);
    expect(batch.closure?.cost).toBe(closureCost(batch.games.length));
    for (let i = 0; i < 3000; i++) {
      const drawn = new Set<number>();
      while (drawn.size < 6) drawn.add(1 + random.nextInt(60));
      const draw = { lottery: Lottery.MEGA_SENA, contestNumber: i, date: '', numbers: [...drawn] };
      expect(closureHoldsFor(batch, draw)).toBe(true);
    }
    // Caso construído: 4 dezenas do pool + 2 de fora → precisa haver quadra.
    const forced = { lottery: Lottery.MEGA_SENA, contestNumber: 0, date: '', numbers: [3, 21, 38, 58, 1, 2] };
    expect(batch.games.some((g) => g.numbers.filter((n) => forced.numbers.includes(n)).length >= 4)).toBe(true);
  });

  it('+Milionária anexa uma dupla de trevos válida por jogo', () => {
    const batch = generateClosure(Lottery.MAIS_MILIONARIA, range(1, 9), 4, {
      random: createSeededRandom(1),
    });
    for (const game of batch.games) {
      const [a, b] = game.trevoDuplas![0];
      expect(a).not.toBe(b);
      expect([a, b].every((t) => t >= 1 && t <= 6)).toBe(true);
    }
  });

  it('só oferece garantias que podem pagar prêmio', () => {
    expect(offeredGuarantees(Lottery.MEGA_SENA)).toEqual([4]);
    expect(() => generateClosure(Lottery.MEGA_SENA, range(1, 9), 3)).toThrow(RangeError);
  });

  it('valida pool: tamanho, intervalo', () => {
    expect(() => generateClosure(Lottery.MEGA_SENA, range(1, 6), 4)).toThrow(RangeError);
    expect(() => generateClosure(Lottery.MEGA_SENA, range(1, 16), 4)).toThrow(RangeError);
    expect(() => generateClosure(Lottery.MEGA_SENA, [1, 2, 3, 4, 5, 6, 99], 4)).toThrow(RangeError);
    expect(() => generateClosure(Lottery.MAIS_MILIONARIA, range(1, 13), 4)).toThrow(RangeError);
  });

  it('custo = jogos × preço de referência', () => {
    expect(closureCost(20)).toBe(20 * SIMPLE_BET_PRICE_BRL);
  });
});
