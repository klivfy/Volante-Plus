import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  concreteBatchOdds,
  concursosForNoPrize,
  modelBatchOdds,
} from '../batchOdds';
import {
  hypergeometricAtLeast,
  hypergeometricProbability,
  prizeProbabilities,
} from '../hypergeometric';
import { createSeededRandom, RandomSource } from '../random';

/** Soma exata das faixas oficiais — chance de "qualquer prêmio" de 1 aposta. */
function anyPrize(lottery: Lottery): number {
  return Object.values(prizeProbabilities(lottery)).reduce((a, b) => a + b, 0);
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/**
 * Fórmula DIRETA e independente para dois jogos A e B que compartilham
 * `shared` dezenas (cada um com n dezenas, sem outros cruzamentos):
 * P(nenhum premia) somando sobre (x, a, b) — acertos na parte comum, só em A,
 * só em B. Serve de oráculo externo para o DP de átomos do `concreteBatchOdds`.
 */
function twoGameNoPrizeDirect(
  lotteryN: number,
  K: number,
  n: number,
  shared: number,
  minHits: number,
): number {
  let noPrize = 0;
  const outside = lotteryN - (2 * n - shared);
  for (let x = 0; x <= shared; x++) {
    for (let a = 0; a + x <= K && a <= n - shared; a++) {
      for (let b = 0; b + a + x <= K && b <= n - shared; b++) {
        const weight =
          (comb(shared, x) * comb(n - shared, a) * comb(n - shared, b) * comb(outside, K - x - a - b)) /
          comb(lotteryN, K);
        if (weight === 0) continue;
        if (a + x < minHits && b + x < minHits) noPrize += weight;
      }
    }
  }
  return noPrize;
}

describe('modelBatchOdds', () => {
  it('com 1 jogo reproduz exatamente a chance de qualquer prêmio da aposta simples', () => {
    for (const lottery of [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA, Lottery.QUINA]) {
      const odds = modelBatchOdds(lottery, 1);
      expect(odds.anyPrizeProbability).toBeCloseTo(anyPrize(lottery), 12);
      expect(odds.noPrizeProbability).toBeCloseTo(1 - anyPrize(lottery), 12);
      expect(odds.expectedPrizedGames).toBeCloseTo(anyPrize(lottery), 12);
    }
  });

  it('lote maior premia pelo menos tanto quanto o menor (disjunção)', () => {
    for (const lottery of [Lottery.MEGA_SENA, Lottery.QUINA]) {
      const one = modelBatchOdds(lottery, 1);
      const two = modelBatchOdds(lottery, 2);
      const four = modelBatchOdds(lottery, 4);
      expect(two.anyPrizeProbability).toBeGreaterThan(one.anyPrizeProbability);
      expect(four.anyPrizeProbability).toBeGreaterThan(two.anyPrizeProbability);
    }
  });

  it('nunca passa da união dos eventos: P ≤ G · p(1 aposta)', () => {
    for (const lottery of [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA, Lottery.QUINA]) {
      const p = anyPrize(lottery);
      const four = modelBatchOdds(lottery, 4);
      expect(four.anyPrizeProbability).toBeLessThanOrEqual(4 * p + 1e-12);
    }
  });

  it('+Milionária modelo bate com Monte Carlo semeado (duplas aleatórias)', () => {
    const odds = modelBatchOdds(Lottery.MAIS_MILIONARIA, 2);
    const random: RandomSource = createSeededRandom(20261103);
    const N = 50;
    const iterations = 200_000;
    let prized = 0;
    /** Amostra parcial de Fisher-Yates: k elementos de [1..n]. */
    const sample = (n: number, k: number): number[] => {
      const deck = Array.from({ length: n }, (_, i) => i + 1);
      for (let i = 0; i < k; i++) {
        const j = i + Math.floor(random.nextFloat() * (n - i));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return deck.slice(0, k);
    };
    for (let iteration = 0; iteration < iterations; iteration++) {
      // Sorteio e jogos vêm de baralhos INDEPENDENTES — o mesmo baralho
      // tornaria os jogos disjuntos do sorteio por construção.
      const drawn = sample(N, 6);
      const drawnTrevos = sample(6, 2);
      const dealt = sample(N, 12);
      let won = false;
      for (let game = 0; game < 2 && !won; game++) {
        const numbers = dealt.slice(game * 6, game * 6 + 6);
        const hits = numbers.filter((value) => drawn.includes(value)).length;
        const dupla = sample(6, 2);
        const trevoHits = dupla.filter((value) => drawnTrevos.includes(value)).length;
        if (hits >= 4 || (hits >= 2 && trevoHits >= 1)) won = true;
      }
      if (won) prized++;
    }
    const simulated = prized / iterations;
    // Tolerância ≈ 4σ para 200 mil simulações (sd ≈ 8e-4).
    expect(simulated).toBeGreaterThan(odds.anyPrizeProbability - 0.004);
    expect(simulated).toBeLessThan(odds.anyPrizeProbability + 0.004);
  });

  it('rejeita quantidades inválidas e aceita a âncora de 1 jogo', () => {
    expect(() => modelBatchOdds(Lottery.MEGA_SENA, 0)).toThrow(RangeError);
    expect(() => modelBatchOdds(Lottery.MEGA_SENA, 1.5)).toThrow(RangeError);
    expect(() => modelBatchOdds(Lottery.MEGA_SENA, 5)).toThrow(RangeError);
    expect(() => modelBatchOdds(Lottery.MEGA_SENA, 1)).not.toThrow();
  });
});

describe('concreteBatchOdds', () => {
  const MEGA_MIN_HITS = 4;

  it('um jogo isolado = chance da aposta simples (Mega e Quina)', () => {
    const game = [3, 11, 19, 27, 41, 55];
    expect(concreteBatchOdds(Lottery.MEGA_SENA, [game]).anyPrizeProbability).toBeCloseTo(
      anyPrize(Lottery.MEGA_SENA),
      12,
    );
    const quina = [2, 9, 17, 33, 76];
    expect(concreteBatchOdds(Lottery.QUINA, [quina]).anyPrizeProbability).toBeCloseTo(
      anyPrize(Lottery.QUINA),
      12,
    );
  });

  it('dois jogos disjuntos = modelo de 2 jogos (cruzamento de escopos)', () => {
    const games = [
      [3, 11, 19, 27, 41, 55],
      [1, 7, 23, 33, 47, 59],
    ];
    const concrete = concreteBatchOdds(Lottery.MEGA_SENA, games);
    const model = modelBatchOdds(Lottery.MEGA_SENA, 2);
    expect(concrete.anyPrizeProbability).toBeCloseTo(model.anyPrizeProbability, 12);
  });

  it('jogos idênticos não dobram a chance (eventos idênticos)', () => {
    const game = [3, 11, 19, 27, 41, 55];
    const odds = concreteBatchOdds(Lottery.MEGA_SENA, [game, game, game]);
    expect(odds.anyPrizeProbability).toBeCloseTo(anyPrize(Lottery.MEGA_SENA), 12);
  });

  it('sobreposição de 3 dezenas bate com a fórmula direta independente', () => {
    // A = {1..6}, B = {4..9} — 3 dezenas em comum.
    const games = [
      [1, 2, 3, 4, 5, 6],
      [4, 5, 6, 7, 8, 9],
    ];
    const odds = concreteBatchOdds(Lottery.MEGA_SENA, games);
    const direct = 1 - twoGameNoPrizeDirect(60, 6, 6, 3, MEGA_MIN_HITS);
    expect(odds.anyPrizeProbability).toBeCloseTo(direct, 12);
  });

  it('sem sobreposição a fórmula direta também confere (caso degenerado)', () => {
    const games = [
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ];
    const odds = concreteBatchOdds(Lottery.MEGA_SENA, games);
    const direct = 1 - twoGameNoPrizeDirect(60, 6, 6, 0, MEGA_MIN_HITS);
    expect(odds.anyPrizeProbability).toBeCloseTo(direct, 12);
  });

  it('fechamento realista: lote sobreposto fica entre o melhor jogo e a união ingênua', () => {
    const games = [
      [3, 7, 11, 19, 23, 31],
      [3, 7, 11, 37, 41, 44],
      [7, 19, 23, 37, 44, 48],
    ];
    const odds = concreteBatchOdds(Lottery.MEGA_SENA, games);
    const single = anyPrize(Lottery.MEGA_SENA);
    const naiveUnion = 3 * single;
    expect(odds.anyPrizeProbability).toBeGreaterThanOrEqual(single);
    expect(odds.anyPrizeProbability).toBeLessThanOrEqual(naiveUnion);
    expect(odds.gamesCount).toBe(3);
  });

  it('+Milionária com dupla conhecida: P(n≥4) + (P(3)+P(2))·3/5', () => {
    const game = [4, 9, 15, 22, 38, 47];
    const odds = concreteBatchOdds(Lottery.MAIS_MILIONARIA, [game], [[[1, 2]]]);
    const p4 = hypergeometricAtLeast(50, 6, 6, 4);
    const p3 = hypergeometricProbability(50, 6, 6, 3);
    const p2 = hypergeometricProbability(50, 6, 6, 2);
    const expected = p4 + (p3 + p2) * (9 / 15);
    expect(odds.anyPrizeProbability).toBeCloseTo(expected, 12);
  });

  it('+Milionária com cobertura total de duplas: trevo deixa de ser fator', () => {
    const game = [4, 9, 15, 22, 38, 47];
    const allPairs: [number, number][] = [];
    for (let a = 1; a <= 6; a++) {
      for (let b = a + 1; b <= 6; b++) allPairs.push([a, b]);
    }
    const odds = concreteBatchOdds(Lottery.MAIS_MILIONARIA, [game], [allPairs]);
    const p4 = hypergeometricAtLeast(50, 6, 6, 4);
    const p3 = hypergeometricProbability(50, 6, 6, 3);
    const p2 = hypergeometricProbability(50, 6, 6, 2);
    expect(odds.anyPrizeProbability).toBeCloseTo(p4 + p3 + p2, 12);
    // 15 apostas (uma por dupla) entram no prêmio esperado.
    expect(odds.expectedPrizedGames).toBeCloseTo(15 * anyPrize(Lottery.MAIS_MILIONARIA), 12);
  });

  it('jogos premiados esperados somam as marginais por aposta', () => {
    const games = [
      [3, 11, 19, 27, 41, 55],
      [1, 7, 23, 33, 47, 59],
    ];
    const odds = concreteBatchOdds(Lottery.MEGA_SENA, games);
    expect(odds.expectedPrizedGames).toBeCloseTo(2 * anyPrize(Lottery.MEGA_SENA), 12);
  });

  it('rejeita lotes malformados e +Milionária sem duplas', () => {
    expect(() => concreteBatchOdds(Lottery.MEGA_SENA, [])).toThrow(RangeError);
    expect(() => concreteBatchOdds(Lottery.MEGA_SENA, [[1, 2, 3]])).toThrow(RangeError);
    expect(() => concreteBatchOdds(Lottery.MEGA_SENA, [[1, 1, 2, 3, 4, 5]])).toThrow(RangeError);
    expect(() => concreteBatchOdds(Lottery.MEGA_SENA, [[0, 2, 3, 4, 5, 61]])).toThrow(RangeError);
    const megaGame = [3, 11, 19, 27, 41, 55];
    expect(() => concreteBatchOdds(Lottery.MAIS_MILIONARIA, [[4, 9, 15, 22, 38, 47]])).toThrow(
      RangeError,
    );
    expect(() =>
      concreteBatchOdds(Lottery.MAIS_MILIONARIA, [[4, 9, 15, 22, 38, 47], megaGame], [[[1, 2]]]),
    ).toThrow(RangeError);
    expect(() =>
      concreteBatchOdds(Lottery.MAIS_MILIONARIA, [[4, 9, 15, 22, 38, 47]], []),
    ).toThrow(RangeError);
  });
});

describe('concursosForNoPrize', () => {
  it('resolve o núcleo da geométrica: primeiro n com 1 − q^n ≥ alvo', () => {
    const q = 0.5;
    const target = 0.9;
    const n = concursosForNoPrize(q, target);
    expect(n).toBe(4); // 1 − 0,5³ = 0,875 < 0,9 ≤ 1 − 0,5⁴ = 0,9375
    expect(1 - Math.pow(q, n)).toBeGreaterThanOrEqual(target);
    expect(1 - Math.pow(q, n - 1)).toBeLessThan(target);
  });

  it('chance pior exige mais concursos', () => {
    const easy = concursosForNoPrize(0.5, 0.9);
    const hard = concursosForNoPrize(0.999, 0.9);
    expect(hard).toBeGreaterThan(easy);
  });

  it('lote que sempre premia devolve 1; lote que nunca premia devolve Infinity', () => {
    expect(concursosForNoPrize(0, 0.9)).toBe(1);
    expect(concursosForNoPrize(1, 0.9)).toBe(Infinity);
  });

  it('rejeita probabilidades inválidas', () => {
    expect(() => concursosForNoPrize(-0.1, 0.9)).toThrow(RangeError);
    expect(() => concursosForNoPrize(1.1, 0.9)).toThrow(RangeError);
    expect(() => concursosForNoPrize(NaN, 0.9)).toThrow(RangeError);
    expect(() => concursosForNoPrize(0.5, 0)).toThrow(RangeError);
    expect(() => concursosForNoPrize(0.5, 1)).toThrow(RangeError);
    expect(() => concursosForNoPrize(0.5, -0.2)).toThrow(RangeError);
  });
});
