import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  batchStructure,
  gameSumWindow,
  hasConsecutivePair,
  parityWindow,
} from '../batchMetrics';

/** Lote disjunto estilo gerador com deduplicação absoluta (4 jogos × 6 dezenas). */
const disjointBatch: number[][] = [
  [1, 7, 13, 25, 39, 52],
  [2, 8, 14, 26, 40, 53],
  [3, 9, 15, 27, 41, 54],
  [4, 10, 16, 28, 42, 55],
];

describe('batchStructure — lote disjunto (gerador comum)', () => {
  it('lote sem repetição de dezenas: sobreposição zero e reuso zero', () => {
    const structure = batchStructure(disjointBatch);
    expect(structure.gamesCount).toBe(4);
    expect(structure.numbersPerGame).toBe(6);
    expect(structure.distinctNumbers).toBe(24);
    expect(structure.reusedNumbers).toBe(0);
    expect(structure.maxReuse).toBe(1);
    expect(structure.meanPairwiseOverlap).toBe(0);
    expect(structure.maxPairwiseOverlap).toBe(0);
  });

  it('somas: mínima, máxima e média exatas', () => {
    const structure = batchStructure(disjointBatch);
    const sums = disjointBatch.map((game) => game.reduce((a, b) => a + b, 0));
    expect(structure.sumMin).toBe(Math.min(...sums));
    expect(structure.sumMax).toBe(Math.max(...sums));
    expect(structure.sumMean).toBeCloseTo(sums.reduce((a, b) => a + b, 0) / 4, 10);
  });

  it('perfil de paridade conta jogos por quantidade de ímpares', () => {
    // [1,7,13,25,39,52] → 5 ímpares; [2,8,14,26,40,53] → 1;
    // [3,9,15,27,41,54] → 5; [4,10,16,28,42,55] → 1
    const structure = batchStructure(disjointBatch);
    expect(structure.parityProfile[1]).toBe(2);
    expect(structure.parityProfile[5]).toBe(2);
    // Somatório do perfil = total de jogos
    expect(structure.parityProfile.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('dezenas consecutivas e décadas por jogo', () => {
    const withConsecutive: number[][] = [[10, 11, 20, 30, 40, 50]];
    expect(batchStructure(withConsecutive).gamesWithConsecutive).toBe(1);
    expect(batchStructure(disjointBatch.slice(0, 1)).gamesWithConsecutive).toBe(0);
    // [1,7,13,25,39,52]: décadas 1,1,2,3,4,6 → 5 distintas
    expect(batchStructure(disjointBatch.slice(0, 1)).meanDistinctDecades).toBe(5);
  });

  it('jogo não ordenado mede a mesma estrutura (independente de ordem)', () => {
    const sorted = batchStructure([[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7]]);
    const shuffled = batchStructure([[6, 5, 4, 3, 2, 1], [7, 5, 3, 1, 4, 2]]);
    expect(shuffled).toEqual(sorted);
  });
});

describe('batchStructure — lote com sobreposição (fechamento)', () => {
  it('interseção média e máxima entre jogos que compartilham dezenas', () => {
    const overlapping: number[][] = [
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 7],
      [8, 9, 10, 11, 12, 13],
    ];
    const structure = batchStructure(overlapping);
    // |A∩B| = 5, |A∩C| = 0, |B∩C| = 0 → média 5/3
    expect(structure.meanPairwiseOverlap).toBeCloseTo(5 / 3, 10);
    expect(structure.maxPairwiseOverlap).toBe(5);
    // Distintas: 1..13 = 13; reusadas: 1,2,3,4,5 (5 dezenas); reuso máximo 2
    expect(structure.distinctNumbers).toBe(13);
    expect(structure.reusedNumbers).toBe(5);
    expect(structure.maxReuse).toBe(2);
  });

  it('cobertura de pares do pool: satura em 1 para o pool todo jogado', () => {
    const pool = [1, 2, 3, 4, 5, 6, 7, 8];
    const full: number[][] = [[1, 2, 3, 4, 5, 6], [3, 4, 5, 6, 7, 8]];
    const structure = batchStructure(full, { pool });
    // C(8,2) = 28 pares; o jogo 1 cobre 15, o jogo 2 acrescenta 9 → 24/28
    expect(structure.pairCoverageOfPool).toBeCloseTo(24 / 28, 10);

    const all: number[][] = [[1, 2, 3, 4, 5, 6], [3, 4, 5, 6, 7, 8], [1, 2, 7, 8, 5, 6]];
    expect(batchStructure(all, { pool }).pairCoverageOfPool).toBe(1);
  });

  it('jogo único dentro do pool cobre C(6,2)/C(pool,2)', () => {
    const pool = Array.from({ length: 15 }, (_, i) => i + 1);
    const structure = batchStructure([[1, 2, 3, 4, 5, 6]], { pool });
    expect(structure.pairCoverageOfPool).toBeCloseTo(15 / 105, 10);
  });
});

describe('batchStructure — validação de entrada', () => {
  it('lote vazio lança RangeError', () => {
    expect(() => batchStructure([])).toThrow(RangeError);
  });

  it('jogos de tamanhos diferentes lançam RangeError', () => {
    expect(() => batchStructure([[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]])).toThrow(RangeError);
  });

  it('dezena repetida dentro do jogo lança RangeError', () => {
    expect(() => batchStructure([[1, 1, 3, 4, 5, 6]])).toThrow(RangeError);
  });

  it('dezena inválida (não inteira positiva) lança RangeError', () => {
    expect(() => batchStructure([[1, 2, 3, 4, 5, 0]])).toThrow(RangeError);
    expect(() => batchStructure([[1, 2, 3, 4, 5, 6.5]])).toThrow(RangeError);
  });

  it('pool com menos de 2 dezenas lança RangeError', () => {
    expect(() => batchStructure([[1, 2, 3, 4, 5, 6]], { pool: [7] })).toThrow(RangeError);
  });
});

describe('gameSumWindow e parityWindow', () => {
  it('faixa de soma central = média ± 1 σ por modalidade', () => {
    // Mega 6/60: média 183, σ = √1647 ≈ 40,58 → 142..224
    expect(gameSumWindow(Lottery.MEGA_SENA)).toEqual({ min: 142, max: 224 });
    // Quina 5/80: média 202,5, σ = √2531,25 ≈ 50,31 → 152..253
    expect(gameSumWindow(Lottery.QUINA)).toEqual({ min: 152, max: 253 });
    // +Milionária 6/50: média 153, σ = √1122 ≈ 33,50 → 120..186
    expect(gameSumWindow(Lottery.MAIS_MILIONARIA)).toEqual({ min: 120, max: 186 });
  });

  it('faixa modal de paridade exclui apenas os extremos', () => {
    expect(parityWindow(Lottery.MEGA_SENA)).toEqual({ min: 2, max: 4 });
    expect(parityWindow(Lottery.QUINA)).toEqual({ min: 1, max: 4 });
    expect(parityWindow(Lottery.MAIS_MILIONARIA)).toEqual({ min: 2, max: 4 });
  });
});

describe('hasConsecutivePair', () => {
  it('detecta o par consecutivo em qualquer posição', () => {
    expect(hasConsecutivePair([10, 11, 20, 30, 40, 50])).toBe(true);
    expect(hasConsecutivePair([1, 3, 5, 59, 60, 2])).toBe(true);
    expect(hasConsecutivePair([1, 3, 5, 7, 9, 11])).toBe(false);
  });
});
