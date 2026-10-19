import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { CLOSURE_TABLES } from '../closureTables';
import {
  SIMPLE_BET_PRICE_BRL,
  closureCost,
  closureHoldsFor,
  designClosure,
  generateClosure,
  offeredGuarantees,
  schonheimBound,
  verifyClosure,
  verifyTrevoClosure,
} from '../closureDesigner';
import { allTrevoPairs } from '../gameGenerator';
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

  it('+Milionária: fechamento em 3 cores, com contrato de trevo verificado exaustivamente', () => {
    for (const guarantee of [2, 3, 4]) {
      const batch = generateClosure(Lottery.MAIS_MILIONARIA, range(1, 10), guarantee, {
        random: createSeededRandom(7),
      });
      expect(batch.closure?.trevoClosure).toBe(true);
      expect(batch.closure?.guarantee).toBe(guarantee);
      // Custo = 3× o fechamento de dezenas, declarado no contrato.
      expect(batch.closure?.cost).toBe(closureCost(batch.games.length));
      expect(verifyTrevoClosure(batch.games, batch.sourcePool!, guarantee)).toBe(true);
      // Para qualquer sorteio com `guarantee` dezenas do pool, todo par de
      // trevos sorteado deixa o contrato de pé.
      const random = createSeededRandom(11);
      const poolNumbers = batch.sourcePool!;
      const hitNumbers = poolNumbers.slice(0, guarantee).concat(
        Array.from({ length: 6 - guarantee }, () => 1 + random.nextInt(50)),
      );
      for (const [x, y] of allTrevoPairs(Lottery.MAIS_MILIONARIA)) {
        const draw = {
          lottery: Lottery.MAIS_MILIONARIA,
          contestNumber: 1,
          date: '',
          numbers: hitNumbers,
          trevos: [x, y],
        };
        expect(closureHoldsFor(batch, draw)).toBe(true);
      }
    }
  });

  it('oferece garantias com trevo na +Milionária (2, 3 e 4 pagam)', () => {
    expect(offeredGuarantees(Lottery.MAIS_MILIONARIA)).toEqual([2, 3, 4]);
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

describe('tabelas pré-computadas', () => {
  it('toda entrada é uma cobertura válida (verificação exaustiva)', () => {
    for (const [key, blocks] of Object.entries(CLOSURE_TABLES)) {
      const [v, t] = key.split(':').map(Number);
      const positions = range(0, v - 1);
      const design = { games: blocks.map((b) => [...b]), guarantee: t, poolSize: v };
      expect(verifyClosure(design, positions), `C(${v},6,${t})`).toBe(true);
      expect(blocks.every((b) => b.length === 6 && new Set(b).size === 6)).toBe(true);
    }
  });

  it('tamanhos conhecidos (regressão) e nunca abaixo do limite de Schönheim', () => {
    const known: Record<string, number> = {
      '7:4': 5, '8:4': 7, '9:4': 12, '10:4': 20, '11:4': 32, '12:4': 41, '13:4': 66, '14:4': 80, '15:4': 134,
      '7:3': 4, '8:3': 4, '9:3': 7, '10:3': 10, '11:3': 11, '12:3': 15, '13:3': 21, '14:3': 25, '15:3': 31,
    };
    for (const [key, size] of Object.entries(known)) {
      const [v, t] = key.split(':').map(Number);
      const design = designClosure(range(1, v), 6, t);
      expect(design.games.length, `C(${v},6,${t})`).toBe(size);
      expect(design.games.length).toBeGreaterThanOrEqual(schonheimBound(v, 6, t));
    }
  });

  it('C(12,6,4) = 41 (ótimo provado na literatura)', () => {
    expect(designClosure(range(1, 12), 6, 4).games).toHaveLength(41);
  });

  it('a renomeação por penalidade preserva a garantia e reduz a popularidade', () => {
    const pool = range(1, 12);
    const plain = designClosure(pool, 6, 4);
    const weighted = designClosure(pool, 6, 4, (numbers) => numbers.filter((n) => n <= 6).length);
    expect(verifyClosure(weighted, pool)).toBe(true);
    const cost = (d: { games: number[][] }) => d.games.reduce((s, g) => s + g.filter((n) => n <= 6).length, 0);
    expect(cost(weighted)).toBeLessThanOrEqual(cost(plain));
  });

  it('é determinístico: o mesmo pool dá sempre o mesmo fechamento', () => {
    const pool = [3, 9, 14, 21, 27, 33, 38, 44, 51, 58, 60];
    expect(designClosure(pool, 6, 4).games).toEqual(designClosure(pool, 6, 4).games);
  });
});

describe('schonheimBound', () => {
  it('valores clássicos', () => {
    expect(schonheimBound(10, 6, 4)).toBe(19); // ⌈10/6·⌈9/5·⌈2·3⌉⌉⌉ = ⌈10/6·11⌉
    expect(schonheimBound(12, 6, 4)).toBe(36); // mais fraco que o ótimo 41
    expect(schonheimBound(7, 6, 3)).toBe(4);
    expect(schonheimBound(7, 6, 4)).toBe(5); // C(7,6,4) = 5 exato: os pontos omitidos não podem caber num 4-subconjunto
  });
});
