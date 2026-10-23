import { describe, expect, it } from 'vitest';
import { Lottery, NumberPerformance, PerformanceTier } from '../../types/domain';
import { closureCost, generateClosure, offeredGuarantees } from '../closureDesigner';
import { generateGames } from '../gameGenerator';
import { expectedNumberHits, prizeProbabilities } from '../hypergeometric';
import { lotteryRules } from '../prizeRules';
import { createSeededRandom } from '../random';

/**
 * Teste dourado (SC-005 da feature 003-quina-lottery): capturado ANTES de
 * parametrizar o motor por modalidade. Mega-Sena e +Milionária têm de
 * produzir exatamente estes números depois da refatoração. Se um snapshot
 * mudar, a refatoração alterou resultado de modalidade existente.
 */

const LEGACY = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

function performances(lottery: Lottery): NumberPerformance[] {
  const { numberUniverse } = lotteryRules(lottery);
  return Array.from({ length: numberUniverse }, (_, i) => ({
    number: i + 1,
    hitCount: (i * 7) % 11,
    simulatedHitRate: ((i * 7) % 11) / 100,
    weight: 1 + ((i * 5) % 9) / 10,
    tier: (['top', 'mid', 'low'] as PerformanceTier[])[i % 3],
  }));
}

describe.each(LEGACY)('golden %s', (lottery) => {
  it('regras e probabilidades por faixa', () => {
    // `betPriceBrl` entrou na Fase 1: o snapshot cobre só os campos originais.
    const { betPriceBrl, ...original } = lotteryRules(lottery);
    expect(betPriceBrl).toBe(6);
    expect(original).toMatchSnapshot();
    expect(prizeProbabilities(lottery)).toMatchSnapshot();
    expect(expectedNumberHits(lottery)).toMatchSnapshot();
  });

  it('lote com semente fixa, por estratégia', () => {
    for (const strategy of ['UNPOPULAR', 'FREQUENCY_TIERS'] as const) {
      const batch = generateGames(lottery, 4, performances(lottery), {
        strategy,
        random: createSeededRandom(20261023),
      });
      expect(batch.games).toMatchSnapshot(strategy);
    }
  });

  it('fechamento com semente fixa e custo', () => {
    const pool = [3, 7, 11, 19, 23, 31, 37, 41, 44, 48];
    for (const guarantee of offeredGuarantees(lottery)) {
      const batch = generateClosure(lottery, pool, guarantee, {
        random: createSeededRandom(7),
      });
      expect({ games: batch.games, closure: batch.closure }).toMatchSnapshot(`t${guarantee}`);
    }
    expect(closureCost(10)).toMatchSnapshot();
  });
});
