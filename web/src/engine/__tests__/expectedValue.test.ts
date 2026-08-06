import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import { calculateEV, kellyCriterion, kellySimulation, PrizeAverage } from '../expectedValue';

const MEGA_PRIZES: PrizeAverage[] = [
  { tier: '6', averagePrize: 0 }, // entra via accumulatedPrize
  { tier: '5', averagePrize: 50_000 },
  { tier: '4', averagePrize: 1_000 },
];

describe('calculateEV', () => {
  it('é negativo para um bilhete comum sem acumulação relevante', () => {
    const result = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0);
    expect(result.ev).toBeLessThan(0);
  });

  it('cresce com o valor acumulado', () => {
    const small = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 10_000_000);
    const large = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 500_000_000);
    expect(large.ev).toBeGreaterThan(small.ev);
  });

  it('breakEvenAccumulated é positivo e finito para a Mega-Sena', () => {
    const result = calculateEV(Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0);
    expect(result.breakEvenAccumulated).toBeGreaterThan(0);
    expect(Number.isFinite(result.breakEvenAccumulated)).toBe(true);
  });
});

describe('kellyCriterion', () => {
  it('recomenda fração positiva quando as odds líquidas favorecem o apostador', () => {
    // p alto e odds boas o suficiente para vantagem clara.
    const result = kellyCriterion(0.5, 2);
    expect(result.isPositive).toBe(true);
    expect(result.fraction).toBeGreaterThan(0);
  });

  it('recomenda zero para odds desfavoráveis', () => {
    const result = kellyCriterion(0.001, 0.5);
    expect(result.isPositive).toBe(false);
    expect(result.fraction).toBe(0);
  });

  it('degenera com segurança para odds <= 0', () => {
    expect(kellyCriterion(0.5, 0)).toEqual({ fraction: 0, isPositive: false });
  });
});

describe('kellySimulation', () => {
  it('recomenda aposta zero quando o EV não é positivo', () => {
    const result = kellySimulation(1000, Lottery.MEGA_SENA, MEGA_PRIZES, 5, 0);
    expect(result.recommendedBet).toBe(0);
    expect(result.fraction).toBe(0);
  });
});
