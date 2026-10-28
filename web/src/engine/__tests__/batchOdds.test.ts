import { describe, expect, it } from 'vitest';
import { Lottery, NumberPerformance } from '../../types/domain';
import {
  batchAnyPrizeProbability,
  concursosNeededForTarget,
  disjointBatchOdds,
  singleBetAnyPrizeProbability,
} from '../batchOdds';
import { generateGames } from '../gameGenerator';
import { binomial } from '../hypergeometric';
import { isPrized, lotteryRules } from '../prizeRules';
import { createSeededRandom } from '../random';

/**
 * Âncoras exatas calculadas à mão (combinações fechadas):
 * - Mega C(60,6) = 50.063.860 · quadra C(6,4)·C(54,2) = 21.465
 * - Quina C(80,5) = 24.040.016 · duque C(5,2)·C(75,3) = 675.250
 * - +Mili C(50,6) = 15.890.700 · faixa 10 (2+1) = C(6,2)·C(44,4) × 8/15
 * A estrutura de faixas da +Milionária (4/5/6 dezenas premiam sem trevo;
 * 3 e 2 exigem trevo) foi conferida no regulamento — 10 faixas oficiais.
 */

function uniformPerformances(universe: number): NumberPerformance[] {
  return Array.from({ length: universe }, (_, i) => ({
    number: i + 1,
    hitCount: 0,
    simulatedHitRate: 0,
    weight: 1,
    tier: 'mid' as const,
  }));
}

/** Fórmula disjunta DIRETA (derivação independente das células de Venn). */
function directDisjointNoPrize(
  lottery: Lottery,
  gamesCount: number,
  maxHitsPerGame: number,
): number {
  const rules = lotteryRules(lottery);
  const k = rules.numbersPerBet;
  const K = rules.numbersDrawn;
  const N = rules.numberUniverse;
  let total = 0;
  const walk = (gameIndex: number, remaining: number, weight: number): void => {
    if (gameIndex === gamesCount) {
      total += (weight * binomial(N - gamesCount * k, remaining)) / binomial(N, K);
      return;
    }
    for (let h = 0; h <= Math.min(k, maxHitsPerGame, remaining); h++) {
      walk(gameIndex + 1, remaining - h, weight * binomial(k, h));
    }
  };
  walk(0, K, 1);
  return total;
}

describe('singleBetAnyPrizeProbability', () => {
  it('Mega-Sena: soma exata das três faixas (quadra é o mínimo)', () => {
    expect(singleBetAnyPrizeProbability(Lottery.MEGA_SENA)).toBeCloseTo(
      21790 / 50063860,
      12,
    );
  });

  it('Quina: soma exata das quatro faixas (duque é o mínimo)', () => {
    expect(singleBetAnyPrizeProbability(Lottery.QUINA)).toBeCloseTo(
      703376 / 24040016,
      12,
    );
  });

  it('+Milionária: 1 em 11,4 — âncora do regulamento (10 faixas oficiais)', () => {
    const p = singleBetAnyPrizeProbability(Lottery.MAIS_MILIONARIA);
    expect(p).toBeCloseTo(1395142 / 15890700, 9);
    expect(1 / p).toBeCloseTo(11.39, 1);
  });

  it('+Milionária: faixa mínima oficial (2+1) vale exatamente 1 em 14,63', () => {
    // P(2 dezenas) × P(exatamente 1 trevo) = 2.036.265/15.890.700 × 8/15
    const faixa10 = (2036265 / 15890700) * (8 / 15);
    expect(1 / faixa10).toBeCloseTo(14.63, 1);
    // E a classificação do motor concorda: 2 acertos sem trevo NÃO premia.
    expect(isPrized(Lottery.MAIS_MILIONARIA, 2, 0)).toBe(false);
    expect(isPrized(Lottery.MAIS_MILIONARIA, 2, 1)).toBe(true);
    // 4/5/6 dezenas premiam mesmo sem trevo (faixas 2/4/6 agrupam 0 ou 1 trevo).
    expect(isPrized(Lottery.MAIS_MILIONARIA, 4, 0)).toBe(true);
    expect(isPrized(Lottery.MAIS_MILIONARIA, 5, 0)).toBe(true);
    expect(isPrized(Lottery.MAIS_MILIONARIA, 6, 0)).toBe(true);
    expect(isPrized(Lottery.MAIS_MILIONARIA, 3, 0)).toBe(false);
  });
});

describe('disjointBatchOdds', () => {
  const LOTTERIES = [
    Lottery.MEGA_SENA,
    Lottery.MAIS_MILIONARIA,
    Lottery.QUINA,
  ];

  it('G = 1 reproduce exatamente o jogo simples, nas três modalidades', () => {
    for (const lottery of LOTTERIES) {
      const batch = disjointBatchOdds(lottery, 1);
      expect(batch.anyPrizeProbability).toBeCloseTo(
        singleBetAnyPrizeProbability(lottery),
        12,
      );
    }
  });

  it('Mega G=4 bate com a fórmula disjunta direta (máximo 3 acertos por jogo)', () => {
    const batch = disjointBatchOdds(Lottery.MEGA_SENA, 4);
    expect(batch.noPrizeProbability).toBeCloseTo(
      directDisjointNoPrize(Lottery.MEGA_SENA, 4, 3),
      12,
    );
  });

  it('Quina G=2 bate com a fórmula disjunta direta (máximo 1 acerto por jogo)', () => {
    const batch = disjointBatchOdds(Lottery.QUINA, 2);
    expect(batch.noPrizeProbability).toBeCloseTo(
      directDisjointNoPrize(Lottery.QUINA, 2, 1),
      12,
    );
  });

  it('monotônica em G e dentro dos limites [p, min(1, G·p)]', () => {
    for (const lottery of LOTTERIES) {
      const single = singleBetAnyPrizeProbability(lottery);
      let previous = 0;
      for (let g = 1; g <= 4; g++) {
        const { anyPrizeProbability: p } = disjointBatchOdds(lottery, g);
        expect(p).toBeGreaterThan(previous);
        expect(p).toBeGreaterThanOrEqual(single - 1e-12);
        expect(p).toBeLessThanOrEqual(Math.min(1, g * single + 1e-12));
        previous = p;
      }
    }
  });

  it('número esperado de jogos premiados = G × p (linearidade exata)', () => {
    for (const lottery of LOTTERIES) {
      const single = singleBetAnyPrizeProbability(lottery);
      const batch = disjointBatchOdds(lottery, 4);
      expect(batch.expectedPrizedGames).toBeCloseTo(4 * single, 12);
    }
  });

  it('+Milionária: duplas distintas rendem MAIS que duplas repetidas (G ≥ 2)', () => {
    for (let g = 2; g <= 4; g++) {
      const batch = disjointBatchOdds(Lottery.MAIS_MILIONARIA, g);
      expect(batch.anyPrizeProbabilityRepeatedDuplas).toBeDefined();
      expect(batch.anyPrizeProbability).toBeGreaterThan(
        batch.anyPrizeProbabilityRepeatedDuplas!,
      );
    }
    // G = 1: uma única dupla, modelos idênticos.
    const one = disjointBatchOdds(Lottery.MAIS_MILIONARIA, 1);
    expect(one.anyPrizeProbability).toBeCloseTo(
      one.anyPrizeProbabilityRepeatedDuplas!,
      12,
    );
  });
});

describe('batchAnyPrizeProbability (lote concreto)', () => {
  it('lote disjunto canônico coincide com o modelo marginal (Mega G=2)', () => {
    const games = [
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ];
    expect(batchAnyPrizeProbability(Lottery.MEGA_SENA, games)).toBeCloseTo(
      disjointBatchOdds(Lottery.MEGA_SENA, 2).anyPrizeProbability,
      12,
    );
  });

  it('jogos IDÊNTICOS desperdiçam orçamento: ficam no piso do jogo único', () => {
    const identical = [
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6],
    ];
    const disjoint = [
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ];
    const identicalP = batchAnyPrizeProbability(Lottery.MEGA_SENA, identical);
    expect(identicalP).toBeCloseTo(
      singleBetAnyPrizeProbability(Lottery.MEGA_SENA),
      12,
    );
    expect(batchAnyPrizeProbability(Lottery.MEGA_SENA, disjoint)).toBeGreaterThan(
      identicalP,
    );
  });

  it('+Milionária: duplas distintas vencem duplas idênticas no mesmo lote', () => {
    const games = [
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
      [13, 14, 15, 16, 17, 18],
      [19, 20, 21, 22, 23, 24],
    ];
    const repeated = games.map(() => [[1, 2]] as [number, number][]);
    const distinct: [number, number][][] = [
      [[1, 2]],
      [[3, 4]],
      [[5, 6]],
      [[1, 3]],
    ];
    const withRepeated = batchAnyPrizeProbability(
      Lottery.MAIS_MILIONARIA,
      games,
      repeated,
    );
    const withDistinct = batchAnyPrizeProbability(
      Lottery.MAIS_MILIONARIA,
      games,
      distinct,
    );
    expect(withDistinct).toBeGreaterThan(withRepeated);
  });

  it('cobertura total de trevos (15 duplas) garante o lado do trevo: P = P(h >= 2)', () => {
    const allPairs: [number, number][] = [];
    for (let a = 1; a <= 6; a++) {
      for (let b = a + 1; b <= 6; b++) allPairs.push([a, b]);
    }
    const pAtLeast2 =
      2315600 / 15890700; // P(h=2)+P(h=3)+P(h=4)+P(h=5)+P(h=6)
    expect(
      batchAnyPrizeProbability(Lottery.MAIS_MILIONARIA, [[1, 2, 3, 4, 5, 6]], [
        allPairs,
      ]),
    ).toBeCloseTo(pAtLeast2, 12);
  });

  it('valida entradas: duplas ausentes, fora do universo e lotes vazios lançam', () => {
    expect(() => batchAnyPrizeProbability(Lottery.MAIS_MILIONARIA, [[1, 2, 3, 4, 5, 6]])).toThrow(
      RangeError,
    );
    expect(() =>
      batchAnyPrizeProbability(Lottery.MAIS_MILIONARIA, [[1, 2, 3, 4, 5, 6]], [
        [[1, 9]] as [number, number][],
      ]),
    ).toThrow(RangeError);
    expect(() => batchAnyPrizeProbability(Lottery.MEGA_SENA, [])).toThrow(RangeError);
    expect(() => disjointBatchOdds(Lottery.MEGA_SENA, 0)).toThrow(RangeError);
    expect(() => disjointBatchOdds(Lottery.MEGA_SENA, 5)).toThrow(RangeError);
  });
});

describe('concursosNeededForTarget', () => {
  it('satisfaz a desigualdade da geométrica em alvo 50%', () => {
    for (const lottery of [
      Lottery.MEGA_SENA,
      Lottery.MAIS_MILIONARIA,
      Lottery.QUINA,
    ]) {
      const p = disjointBatchOdds(lottery, 4).anyPrizeProbability;
      const n = concursosNeededForTarget(lottery, 4, 0.5);
      expect(1 - Math.pow(1 - p, n)).toBeGreaterThanOrEqual(0.5);
      expect(1 - Math.pow(1 - p, n - 1)).toBeLessThan(0.5);
    }
  });

  it('é monotônica no alvo e honesta sobre o custo da Mega-Sena', () => {
    const target50 = concursosNeededForTarget(Lottery.MEGA_SENA, 4, 0.5);
    const target90 = concursosNeededForTarget(Lottery.MEGA_SENA, 4, 0.9);
    expect(target90).toBeGreaterThan(target50);
    // 4 jogos por concurso, ~0,17% por concurso: centenas de concursos.
    expect(target50).toBeGreaterThan(100);
  });

  it('rejeita alvos fora de (0, 1)', () => {
    expect(() => concursosNeededForTarget(Lottery.QUINA, 4, 0)).toThrow(RangeError);
    expect(() => concursosNeededForTarget(Lottery.QUINA, 4, 1)).toThrow(RangeError);
  });
});

describe('concordância Monte Carlo do lote gerado com a teoria exata', () => {
  it('Quina G=4: taxa de lotes premiados dentro de 4σ da teoria', () => {
    const trials = 20000;
    const rng = createSeededRandom(20261029);
    const performances = uniformPerformances(80);
    let prizedBatches = 0;
    for (let t = 0; t < trials; t++) {
      const batch = generateGames(Lottery.QUINA, 4, performances, { random: rng });
      const drawn = new Set<number>();
      while (drawn.size < 5) drawn.add(1 + rng.nextInt(80));
      const anyPrize = batch.games.some((game) =>
        isPrized(Lottery.QUINA, game.numbers.filter((n) => drawn.has(n)).length),
      );
      if (anyPrize) prizedBatches++;
    }
    const exact = disjointBatchOdds(Lottery.QUINA, 4).anyPrizeProbability;
    const observed = prizedBatches / trials;
    const sigma = Math.sqrt((exact * (1 - exact)) / trials);
    expect(Math.abs(observed - exact)).toBeLessThan(4 * sigma);
  }, 120000);

  it('+Milionária G=4 (com duplas): taxa dentro de 4σ da teoria pós-dedup', () => {
    const trials = 20000;
    const rng = createSeededRandom(20261030);
    const performances = uniformPerformances(50);
    let prizedBatches = 0;
    for (let t = 0; t < trials; t++) {
      const batch = generateGames(Lottery.MAIS_MILIONARIA, 4, performances, {
        random: rng,
      });
      const drawn = new Set<number>();
      while (drawn.size < 6) drawn.add(1 + rng.nextInt(50));
      const drawnTrevos = new Set<number>();
      while (drawnTrevos.size < 2) drawnTrevos.add(1 + rng.nextInt(6));
      const anyPrize = batch.games.some((game) => {
        const hits = game.numbers.filter((n) => drawn.has(n)).length;
        const trevoHits = (game.trevoDuplas ?? []).filter(
          ([a, b]) => drawnTrevos.has(a) || drawnTrevos.has(b),
        ).length;
        return isPrized(Lottery.MAIS_MILIONARIA, hits, trevoHits);
      });
      if (anyPrize) prizedBatches++;
    }
    const exact = disjointBatchOdds(Lottery.MAIS_MILIONARIA, 4).anyPrizeProbability;
    const observed = prizedBatches / trials;
    const sigma = Math.sqrt((exact * (1 - exact)) / trials);
    expect(Math.abs(observed - exact)).toBeLessThan(4 * sigma);
  }, 120000);
});
