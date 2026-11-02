import { describe, expect, it } from 'vitest';
import { Draw, Lottery, NumberPerformance } from '../../types/domain';
import {
  empiricalTwoSidedPValue,
  permutePerformances,
  runNullCalibration,
} from '../nullCalibration';
import { createSeededRandom } from '../random';
import { generateSyntheticHistory } from './fixtures';

describe('permutePerformances', () => {
  const performances: NumberPerformance[] = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    hitCount: i * 3,
    simulatedHitRate: i / 10,
    weight: (10 - i) / 10,
    tier: i < 4 ? 'top' : i < 7 ? 'mid' : 'low',
  }));

  it('preserva o multiconjunto de pesos/tiers e o conjunto de dezenas', () => {
    const random = createSeededRandom(5);
    const permuted = permutePerformances(performances, random);

    expect(permuted).toHaveLength(performances.length);
    // Mesmos pesos, apenas reatribuídos
    expect(permuted.map((p) => p.weight).sort((a, b) => a - b)).toEqual(
      performances.map((p) => p.weight).sort((a, b) => a - b),
    );
    expect(permuted.map((p) => p.tier).sort()).toEqual(performances.map((p) => p.tier).sort());
    // Mesmo conjunto de dezenas, sem repetição
    expect(new Set(permuted.map((p) => p.number)).size).toBe(10);
    expect([...permuted.map((p) => p.number)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('é determinístico sob semente e muda com sementes diferentes', () => {
    const a = permutePerformances(performances, createSeededRandom(123));
    const b = permutePerformances(performances, createSeededRandom(123));
    const c = permutePerformances(performances, createSeededRandom(124));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('empiricalTwoSidedPValue', () => {
  it('estimador aditivo: (1 + extremos) / (R + 1)', () => {
    // Centro 3; desvio observado |5-3| = 2; extremos: 1 e 5 → (1+2)/(5+1)
    expect(empiricalTwoSidedPValue(5, [1, 2, 3, 4, 5])).toBeCloseTo(3 / 6, 10);
    // Observado fora da nuvem: nenhum extremo → 1/(R+1) (nunca zero)
    expect(empiricalTwoSidedPValue(100, [1, 2, 3, 4, 5])).toBeCloseTo(1 / 6, 10);
    // Observado no centro: todas as réplicas tão extremas → 1
    expect(empiricalTwoSidedPValue(3, [1, 2, 3, 4, 5])).toBe(1);
  });

  it('nuvem vazia devolve 1 (nada a comparar)', () => {
    expect(empiricalTwoSidedPValue(2, [])).toBe(1);
  });
});

/** Concursos sintéticos em que a dezena 1 está SEMPRE presente (sinal plantado). */
function plantedHistory(lottery: Lottery, count: number, seed: number, startDate: string): Draw[] {
  const random = createSeededRandom(seed);
  const universe = lottery === Lottery.QUINA ? 80 : 60;
  const drawn = lottery === Lottery.QUINA ? 5 : 6;
  const draws: Draw[] = [];
  for (let i = 0; i < count; i++) {
    const numbers = new Set<number>([1]);
    while (numbers.size < drawn) {
      numbers.add(2 + random.nextInt(universe - 1));
    }
    const date = new Date(startDate);
    date.setDate(date.getDate() + i * 3);
    draws.push({
      lottery,
      contestNumber: i + 1,
      date: date.toISOString().slice(0, 10),
      numbers: [...numbers].sort((a, b) => a - b),
    });
  }
  return draws;
}

describe('runNullCalibration', () => {
  it('valida entradas: janela vazia e réplicas inválidas lançam RangeError', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 60, { seed: 1 });
    expect(() => runNullCalibration(Lottery.MEGA_SENA, history, [], { replicates: 5 })).toThrow(
      RangeError,
    );
    expect(() =>
      runNullCalibration(Lottery.MEGA_SENA, history.slice(0, 40), history.slice(40), {
        replicates: 0,
      }),
    ).toThrow(RangeError);
  });

  it('SINAL PLANTADO: dezena 1 em todos os concursos é detectada como acima-do-nulo', () => {
    // Demonstração do PODER do teste: quando existe sinal real (aqui,
    // fabricado), a calibração o separa da nuvem nula. A contrapartida
    // honesta é o teste seguinte: sem sinal, nada é "descoberto".
    const training = plantedHistory(Lottery.MEGA_SENA, 60, 42, '2015-01-01');
    const validation = plantedHistory(Lottery.MEGA_SENA, 30, 77, '2016-01-01');

    const calibration = runNullCalibration(Lottery.MEGA_SENA, training, validation, {
      replicates: 80,
      simulationRounds: 20,
      seed: 9,
    });

    expect(calibration.verdict).toBe('acima-do-nulo');
    expect(calibration.empiricalPValueMeanHits).toBeLessThan(0.05);
    expect(calibration.observedMeanHits).toBeGreaterThan(calibration.nullMeanHits.mean);
  });

  it('HISTÓRICO UNIFORME: sorteio sintético fica consistente com o acaso', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 150, { seed: 5 });
    const calibration = runNullCalibration(Lottery.MEGA_SENA, history.slice(0, 120), history.slice(120), {
      replicates: 80,
      simulationRounds: 10,
      seed: 31,
    });

    expect(calibration.verdict).toBe('consistente-com-o-acaso');
    expect(calibration.empiricalPValueMeanHits).toBeGreaterThanOrEqual(0.05);
    expect(calibration.empiricalPValueMeanHits).toBeLessThanOrEqual(1);
    // O nulo empírico orbita a referência hipergeométrica (0,6 acertos/jogo
    // na Mega): a média das permutações não pode divergir muito dela.
    expect(Math.abs(calibration.nullMeanHits.mean - calibration.expectedMeanHits)).toBeLessThan(
      0.15,
    );
  });

  it('+Milionária: roda com trevos (permutação de duplas) e devolve p-values válidos', () => {
    const history = generateSyntheticHistory(Lottery.MAIS_MILIONARIA, 120, { seed: 3 });
    const calibration = runNullCalibration(
      Lottery.MAIS_MILIONARIA,
      history.slice(0, 90),
      history.slice(90),
      { replicates: 10, simulationRounds: 5, seed: 17 },
    );

    expect(calibration.replicates).toBe(10);
    expect(calibration.empiricalPValueMeanHits).toBeGreaterThanOrEqual(0);
    expect(calibration.empiricalPValueMeanHits).toBeLessThanOrEqual(1);
    expect(calibration.empiricalPValuePrizeRate).toBeGreaterThanOrEqual(0);
    expect(calibration.empiricalPValuePrizeRate).toBeLessThanOrEqual(1);
    expect(['consistente-com-o-acaso', 'acima-do-nulo', 'abaixo-do-nulo']).toContain(
      calibration.verdict,
    );
  });

  it('é reprodutível: mesma semente devolve o mesmo resultado', () => {
    const history = generateSyntheticHistory(Lottery.MEGA_SENA, 100, { seed: 6 });
    const options = { replicates: 15, simulationRounds: 5, seed: 99 } as const;
    const a = runNullCalibration(Lottery.MEGA_SENA, history.slice(0, 80), history.slice(80), options);
    const b = runNullCalibration(Lottery.MEGA_SENA, history.slice(0, 80), history.slice(80), options);
    expect(b).toEqual(a);
  });
});
