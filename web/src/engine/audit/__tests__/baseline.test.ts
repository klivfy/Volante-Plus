import { describe, expect, it } from 'vitest';
import { Lottery } from '../../../types/domain';
import { createSeededRandom } from '../../random';
import {
  calibratedChi2Power,
  noncentralityFor,
  observedMeanSum,
  observedNumbersChi2,
  observedRepetition,
  sampleQuantile,
} from '../anomalyTests';
import {
  nullMoments,
  simulateBaseline,
  simulateBiasedNumbersChi2,
  twoTailedPValue,
  upperTailPValue,
} from '../baseline';
import { expectedRepetition, expectedSum, sumStdDeviation } from '../preregistration';
import { Draw } from '../../../types/domain';

const MEGA = Lottery.MEGA_SENA;

/** Histórico honesto e contíguo, com semente controlada. */
function honestHistory(contests: number, seed: number, lottery = MEGA): Draw[] {
  const random = createSeededRandom(seed);
  const universe = lottery === MEGA ? 60 : 50;
  const draws: Draw[] = [];
  for (let i = 0; i < contests; i += 1) {
    const numbers = new Set<number>();
    while (numbers.size < 6) numbers.add(1 + random.nextInt(universe));
    draws.push({
      lottery,
      contestNumber: 9000 + i,
      date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
      numbers: [...numbers].sort((a, b) => a - b),
    });
  }
  return draws;
}

describe('simulateBaseline — reproduz a teoria', () => {
  const baseline = simulateBaseline(MEGA, 300, { histories: 400, seed: 7 });

  it('repetição média simulada converge para K²/N = 0,6', () => {
    const { mean } = nullMoments(baseline.meanRepetition);
    expect(mean).toBeCloseTo(expectedRepetition(MEGA), 2);
  });

  it('soma média simulada converge para K(N+1)/2 = 183', () => {
    const { mean } = nullMoments(baseline.meanSum);
    expect(mean).toBeCloseTo(expectedSum(MEGA), 0);
  });

  it('o desvio-padrão da soma média bate com a fórmula da variância', () => {
    // sd(média de c concursos) = sd(soma de 1 concurso)/√c.
    const { stdDeviation } = nullMoments(baseline.meanSum);
    const theoretical = sumStdDeviation(MEGA) / Math.sqrt(300);
    expect(stdDeviation).toBeGreaterThan(theoretical * 0.85);
    expect(stdDeviation).toBeLessThan(theoretical * 1.15);
  });

  it('o qui-quadrado simulado tem média próxima dos graus de liberdade', () => {
    const { mean } = nullMoments(baseline.numbersChi2);
    expect(mean).toBeGreaterThan(59 * 0.9);
    expect(mean).toBeLessThan(59 * 1.1);
  });

  it('a +Milionária produz distribuição de trevos; a Mega-Sena não', () => {
    expect(baseline.trevosChi2).toBeNull();
    const mais = simulateBaseline(Lottery.MAIS_MILIONARIA, 100, { histories: 50, seed: 3 });
    expect(mais.trevosChi2).not.toBeNull();
    expect(mais.trevosChi2).toHaveLength(50);
  });

  it('é determinístico: a mesma semente devolve a mesma linha de base', () => {
    const a = simulateBaseline(MEGA, 60, { histories: 30, seed: 99 });
    const b = simulateBaseline(MEGA, 60, { histories: 30, seed: 99 });
    expect(a.numbersChi2).toEqual(b.numbersChi2);
    expect(a.meanSum).toEqual(b.meanSum);
  });

  it('rejeita parâmetros que tornariam a linha de base inválida', () => {
    expect(() => simulateBaseline(MEGA, 1, { histories: 10 })).toThrow(/ao menos 2 concursos/);
    expect(() => simulateBaseline(MEGA, 10, { histories: 0 })).toThrow(/ao menos 1 histórico/);
  });
});

describe('p-valores empíricos', () => {
  it('nunca devolvem 0 — 10.000 simulações não sustentam p = 0', () => {
    const samples = [1, 2, 3, 4, 5];
    expect(upperTailPValue(samples, 1e9)).toBeGreaterThan(0);
    expect(upperTailPValue(samples, 1e9)).toBeCloseTo(1 / 6, 12);
  });

  it('cauda superior: observação no centro dá p próximo de 0,5', () => {
    const samples = Array.from({ length: 99 }, (_, i) => i + 1);
    expect(upperTailPValue(samples, 50)).toBeCloseTo(0.5, 1);
  });

  it('bilateral: mede distância ao centro, nos dois sentidos', () => {
    const samples = Array.from({ length: 101 }, (_, i) => i - 50); // −50..50, centro 0
    const low = twoTailedPValue(samples, -45);
    const high = twoTailedPValue(samples, 45);
    expect(low).toBeCloseTo(high, 6);
    expect(twoTailedPValue(samples, 0)).toBeGreaterThan(low);
  });
});

/**
 * O teste de calibração: sob H0, um p-valor bem construído é uniforme em
 * (0,1). Se não for, o limiar de significância não quer dizer o que diz e
 * todo o relatório perde sentido — por isso isto é verificado, não assumido.
 */
describe('calibração sob a hipótese nula', () => {
  const CONTESTS = 120;
  const TRIALS = 200;
  const baseline = simulateBaseline(MEGA, CONTESTS, { histories: 500, seed: 4242 });

  function pValuesUnderNull(statistic: (draws: Draw[]) => number, tail: 'upper' | 'two'): number[] {
    const samples = tail === 'upper' ? baseline.numbersChi2 : baseline.meanSum;
    return Array.from({ length: TRIALS }, (_, t) => {
      const history = honestHistory(CONTESTS, 500_000 + t * 977);
      const observed = statistic(history);
      return tail === 'upper'
        ? upperTailPValue(samples, observed)
        : twoTailedPValue(samples, observed);
    });
  }

  it('A1: p-valores de históricos honestos têm média ≈ 0,5', () => {
    const ps = pValuesUnderNull((draws) => observedNumbersChi2(draws, MEGA), 'upper');
    const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
    expect(mean).toBeGreaterThan(0.42);
    expect(mean).toBeLessThan(0.58);
  });

  it('A1: a taxa de falsos positivos a 10% fica perto de 10%', () => {
    const ps = pValuesUnderNull((draws) => observedNumbersChi2(draws, MEGA), 'upper');
    const rate = ps.filter((p) => p < 0.1).length / ps.length;
    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.19);
  });

  it('A3: p-valores da soma média também são uniformes', () => {
    const ps = pValuesUnderNull(observedMeanSum, 'two');
    const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
    expect(mean).toBeGreaterThan(0.42);
    expect(mean).toBeLessThan(0.58);
  });
});

describe('repetição observada', () => {
  it('bate com a teoria em histórico honesto longo', () => {
    const { mean, pairs } = observedRepetition(honestHistory(4000, 31337));
    expect(pairs).toBe(3999);
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(0.7);
  });

  it('só conta pares realmente vizinhos — buracos não viram vizinhança', () => {
    const draws = honestHistory(10, 5);
    const withGap = [...draws.slice(0, 5), ...draws.slice(6)]; // remove um concurso
    const { pairs } = observedRepetition(withGap);
    // 9 concursos, mas o par que atravessa o buraco não conta.
    expect(pairs).toBe(7);
  });
});

/**
 * Valida o atalho analítico de poder contra a força bruta: simular históricos
 * de fato enviesados e contar quantos o teste pegaria.
 */
describe('poder do qui-quadrado: analítico versus força bruta', () => {
  it('a não-centralidade reproduz o poder da simulação direta', () => {
    const CONTESTS = 150;
    const BIAS = 0.6;
    const ALPHA_LOCAL = 0.05;

    const nullBaseline = simulateBaseline(MEGA, CONTESTS, { histories: 800, seed: 11 });
    const critical = sampleQuantile(nullBaseline.numbersChi2, 1 - ALPHA_LOCAL);

    const bruteForce = simulateBiasedNumbersChi2(MEGA, CONTESTS, BIAS, {
      histories: 800,
      seed: 22,
    });
    const empiricalPower = bruteForce.filter((value) => value > critical).length / bruteForce.length;

    const lambda = noncentralityFor(60, 6, CONTESTS, BIAS);
    const analyticPower = calibratedChi2Power(
      nullBaseline.numbersChi2,
      lambda,
      critical,
      4000,
      33,
    );

    expect(analyticPower).toBeGreaterThan(empiricalPower - 0.1);
    expect(analyticPower).toBeLessThan(empiricalPower + 0.1);
  });

  it('poder cresce com o tamanho do histórico', () => {
    const nullBaseline = simulateBaseline(MEGA, 100, { histories: 300, seed: 1 });
    const critical = sampleQuantile(nullBaseline.numbersChi2, 0.95);
    const small = calibratedChi2Power(
      nullBaseline.numbersChi2,
      noncentralityFor(60, 6, 100, 0.4),
      critical,
      2000,
      5,
    );
    const large = calibratedChi2Power(
      nullBaseline.numbersChi2,
      noncentralityFor(60, 6, 2000, 0.4),
      critical,
      2000,
      5,
    );
    expect(large).toBeGreaterThan(small);
  });

  /**
   * O teste que pegou o erro: com viés zero, a alternativa É a nula, então o
   * poder tem de cair exatamente sobre o alpha. A versão anterior, que usava
   * χ²(59) teórico como referência, devolvia 15% no lugar de 5% — porque o
   * sorteio sem reposição estreita a nula real frente ao χ² teórico.
   */
  it('sem efeito (bias 0), o poder cai para o próprio alpha', () => {
    const nullBaseline = simulateBaseline(MEGA, 100, { histories: 500, seed: 8 });
    const critical = sampleQuantile(nullBaseline.numbersChi2, 0.95);
    const power = calibratedChi2Power(
      nullBaseline.numbersChi2,
      noncentralityFor(60, 6, 100, 0),
      critical,
      4000,
      9,
    );
    expect(power).toBeGreaterThan(0.02);
    expect(power).toBeLessThan(0.09);
  });
});
