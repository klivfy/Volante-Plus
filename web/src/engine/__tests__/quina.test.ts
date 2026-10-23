import { describe, expect, it } from 'vitest';
import { Lottery, NumberPerformance, PerformanceTier } from '../../types/domain';
import { closureCost, designClosure, generateClosure, offeredGuarantees, verifyClosure } from '../closureDesigner';
import { generateGames } from '../gameGenerator';
import { binomial, hypergeometricProbability, prizeProbabilities } from '../hypergeometric';
import { classifyHits, hasTrevos, isPrized, lotteryRules, prizeTiers } from '../prizeRules';
import { createSeededRandom } from '../random';

/**
 * Regras da Quina (feature 003-quina-lottery). Os oráculos vêm de
 * `specs/003-quina-lottery/contracts/quina-official-rules.md`: combinatória
 * exata e a tabela oficial da Caixa (com ±1, pois a tabela arredonda de forma
 * inconsistente).
 */

const TOTAL = 24_040_016; // C(80,5)

describe('regras da Quina', () => {
  it('universo, sorteio, aposta, preço e faixas', () => {
    const rules = lotteryRules(Lottery.QUINA);
    expect(rules).toMatchObject({
      numberUniverse: 80,
      numbersDrawn: 5,
      numbersPerBet: 5,
      minSelection: 5,
      maxSelection: 15,
      betPriceBrl: 3,
      trevoUniverse: 0,
    });
    expect(hasTrevos(Lottery.QUINA)).toBe(false);
    expect(prizeTiers(Lottery.QUINA).map((t) => t.key)).toEqual(['5', '4', '3', '2']);
  });

  it('só 2 a 5 acertos pagam', () => {
    expect([0, 1].some((h) => isPrized(Lottery.QUINA, h))).toBe(false);
    expect(classifyHits(Lottery.QUINA, 5)?.label).toBe('Quina');
    expect(classifyHits(Lottery.QUINA, 2)?.label).toBe('Duque');
  });

  it('C(80,5) e as chances exatas da aposta simples', () => {
    expect(binomial(80, 5)).toBe(TOTAL);
    const p = prizeProbabilities(Lottery.QUINA);
    expect(p['5']).toBeCloseTo(1 / TOTAL, 18);
    expect(p['4']).toBeCloseTo(375 / TOTAL, 15);
    expect(p['3']).toBeCloseTo(27_750 / TOTAL, 14);
    expect(p['2']).toBeCloseTo(675_250 / TOTAL, 13);
  });

  it('tabela oficial: "1 em N" por quantidade de dezenas, ±1', () => {
    // [dezenas, quina, quadra, terno, duque] — contrato, Verificação 2.
    const official: number[][] = [
      [5, 24040016, 64106, 866, 36],
      [6, 4006669, 21658, 445, 25],
      [7, 1144763, 9409, 261, 18],
      [8, 429286, 4770, 168, 14],
      [9, 190794, 2687, 115, 12],
      [10, 95396, 1635, 82, 9],
      [11, 52035, 1056, 62, 8],
      [12, 30354, 714, 48, 7],
      [13, 18679, 502, 38, 6],
      [14, 12008, 364, 31, 5.8],
      [15, 8005, 271, 25, 5.2],
    ];
    for (const [n, ...oneIn] of official) {
      [5, 4, 3, 2].forEach((hits, i) => {
        const exact = 1 / hypergeometricProbability(80, 5, n, hits);
        expect(Math.abs(exact - oneIn[i])).toBeLessThanOrEqual(1);
      });
    }
  });

  it('preço de n dezenas = C(n,5) × R$ 3,00', () => {
    expect(binomial(15, 5) * lotteryRules(Lottery.QUINA).betPriceBrl).toBe(9009);
    expect(closureCost(10, Lottery.QUINA)).toBe(30);
  });
});

function performances(): NumberPerformance[] {
  return Array.from({ length: 80 }, (_, i) => ({
    number: i + 1,
    hitCount: (i * 7) % 11,
    simulatedHitRate: ((i * 7) % 11) / 100,
    weight: 1 + ((i * 5) % 9) / 10,
    tier: (['top', 'mid', 'low'] as PerformanceTier[])[i % 3],
  }));
}

describe('geração e fechamento da Quina', () => {
  it('gera jogos de 5 dezenas distintas em 1..80, sem trevo', () => {
    for (const strategy of ['UNPOPULAR', 'FREQUENCY_TIERS'] as const) {
      const batch = generateGames(Lottery.QUINA, 4, performances(), {
        strategy,
        random: createSeededRandom(1),
      });
      expect(batch.games.length).toBeGreaterThan(0);
      for (const game of batch.games) {
        expect(game.numbers).toHaveLength(5);
        expect(new Set(game.numbers).size).toBe(5);
        expect(game.numbers.every((n) => n >= 1 && n <= 80)).toBe(true);
        expect(game.trevoDuplas ?? []).toHaveLength(0);
      }
    }
  });

  it('oferece terno e quadra', () => {
    expect(offeredGuarantees(Lottery.QUINA)).toEqual([3, 4]);
  });

  it('fechamento k=5: a garantia vale (verificação exaustiva) e o custo é jogos × R$ 3', () => {
    for (const v of [6, 8, 10, 12, 15]) {
      const pool = Array.from({ length: v }, (_, i) => i * 5 + 3);
      for (const guarantee of [3, 4]) {
        const batch = generateClosure(Lottery.QUINA, pool, guarantee, { random: createSeededRandom(7) });
        const design = designClosure(pool, 5, guarantee);
        expect(verifyClosure(design, pool)).toBe(true);
        expect(batch.games.every((g) => g.numbers.length === 5)).toBe(true);
        expect(batch.closure?.cost).toBe(batch.games.length * 3);
      }
    }
  });
});
