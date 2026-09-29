import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import {
  bayesEvidenceFromDraws,
  bayesTrajectory,
  bayesVerdict,
  designEffect,
  logBayesFactorNumber,
  logBayesFactorUniform,
  logGamma,
} from '../bayesEvidence';
import { createSeededRandom } from '../random';

function honestDraws(count: number, seed: number, bias?: (n: number) => number): Draw[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const drawn = new Set<number>();
    while (drawn.size < 6) {
      let n = 1 + random.nextInt(60);
      // viés opcional: rejeita a dezena com probabilidade 1 − bias(n)
      if (bias && random.nextFloat() > bias(n)) n = 0;
      if (n > 0) drawn.add(n);
    }
    return { lottery: Lottery.MEGA_SENA, contestNumber: i + 1, date: '', numbers: [...drawn] };
  });
}

describe('logGamma', () => {
  it('confere com valores exatos', () => {
    expect(logGamma(1)).toBeCloseTo(0, 12);
    expect(logGamma(2)).toBeCloseTo(0, 12);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 12);
    expect(logGamma(101)).toBeCloseTo(363.73937555556347, 9); // ln(100!)
  });
});

describe('logBayesFactorUniform', () => {
  it('contagens perfeitamente uniformes favorecem H0 (BF10 < 1)', () => {
    expect(logBayesFactorUniform(new Array(60).fill(100), 20)).toBeLessThan(0);
  });
  it('contagens muito desiguais favorecem H1 (BF10 > 1)', () => {
    const counts = new Array(60).fill(100);
    counts[0] = 300;
    counts[1] = 20;
    expect(logBayesFactorUniform(counts, 20)).toBeGreaterThan(0);
  });
  it('rejeita entradas inválidas', () => {
    expect(() => logBayesFactorUniform([5], 1)).toThrow(RangeError);
    expect(() => logBayesFactorUniform([5, 5], 0)).toThrow(RangeError);
  });
  it('caso de 2 categorias bate com a integral Beta–Binomial calculada à mão', () => {
    // c = (3, 1), α = 1: BF10 = Γ(2)/Γ(6) · Γ(4)Γ(2) · 2^4 = (1/120)·6·16 = 0.8
    expect(Math.exp(logBayesFactorUniform([3, 1], 1))).toBeCloseTo(0.8, 12);
  });
});

describe('logBayesFactorNumber (esparso, exato)', () => {
  it('1 concurso com a dezena: BF = 1 (o prior tem média p0)', () => {
    expect(Math.exp(logBayesFactorNumber(1, 1, 0.1, 100))).toBeCloseTo(1, 12);
  });
  it('2 de 2: (κp0+1)/((κ+1)p0), à mão', () => {
    expect(Math.exp(logBayesFactorNumber(2, 2, 0.1, 100))).toBeCloseTo(11 / (101 * 0.1), 12);
  });
  it('contagem esperada → BF < 1; muito acima → BF > 1', () => {
    expect(logBayesFactorNumber(300, 3000, 0.1, 100)).toBeLessThan(0);
    expect(logBayesFactorNumber(440, 3000, 0.1, 100)).toBeGreaterThan(5);
  });
});

describe('calibração sob sorteio honesto', () => {
  it('sorteio honesto: o fator de Bayes quase nunca aponta viés (Markov: P(BF10 ≥ 10) ≤ 10%)', () => {
    const logs: number[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      logs.push(bayesEvidenceFromDraws(Lottery.MEGA_SENA, honestDraws(1500, seed)).log10Bf10);
    }
    const forteContra = logs.filter((l) => l >= 1).length;
    expect(forteContra).toBeLessThanOrEqual(Math.ceil(60 * 0.1));
    logs.sort((x, y) => x - y);
    expect(logs[Math.floor(logs.length / 2)]).toBeLessThan(0); // mediana pró-acaso
  });

  it('validade sequencial (Ville): P(sup BF10 ≥ 20) ≲ 5% sob H0', () => {
    let crossed = 0;
    const runs = 150;
    for (let seed = 1; seed <= runs; seed++) {
      const { maxLog10Bf10 } = bayesTrajectory(Lottery.MEGA_SENA, honestDraws(600, 500 + seed));
      if (maxLog10Bf10 >= Math.log10(20)) crossed++;
    }
    expect(crossed / runs).toBeLessThanOrEqual(0.08);
  });
});

describe('poder sob viés real', () => {
  it('detecta uma dezena com 30% mais chance', () => {
    const draws = honestDraws(3000, 7, (n) => (n === 17 ? 1 : 0.7));
    // Dezena 17 nunca é rejeitada, as demais o são 30% das vezes → 17 fica sobre-representada.
    const e = bayesEvidenceFromDraws(Lottery.MEGA_SENA, draws);
    expect(e.log10BfSparse).toBeGreaterThan(5);
    expect(e.log10Bf10).toBeGreaterThan(1);
    expect(e.verdict).toBe('FORTE_CONTRA_ACASO');
    expect(e.anytimeP).toBeLessThan(0.05);
  });

  it('o alternativo esparso vê o que o omnibus dilui', () => {
    const e = bayesEvidenceFromDraws(Lottery.MEGA_SENA, honestDraws(3000, 7, (n) => (n === 17 ? 1 : 0.7)));
    expect(e.log10BfSparse).toBeGreaterThan(e.log10BfOmnibus + 5);
  });
});

describe('encolhimento pelo Bayes empírico', () => {
  it('sob acaso, encolhe tudo para ≈ K/N; sob viés, preserva o desvio', () => {
    const honest = bayesEvidenceFromDraws(Lottery.MEGA_SENA, honestDraws(2000, 3));
    const spread = Math.max(...honest.shrunkProbabilities) - Math.min(...honest.shrunkProbabilities);
    expect(spread).toBeLessThan(0.012); // bruto costuma ficar em ~0.03
    const biased = bayesEvidenceFromDraws(
      Lottery.MEGA_SENA,
      honestDraws(3000, 7, (n) => (n === 17 ? 1 : 0.7)),
    );
    expect(biased.shrunkProbabilities[16]).toBeGreaterThan(Math.max(...honest.shrunkProbabilities));
  });
  it('a soma das probabilidades encolhidas é K (=6 por concurso)', () => {
    const e = bayesEvidenceFromDraws(Lottery.MEGA_SENA, honestDraws(800, 11));
    expect(e.shrunkProbabilities.reduce((s, p) => s + p, 0)).toBeCloseTo(6, 6);
  });
});

describe('utilidades', () => {
  it('designEffect e escala de veredito', () => {
    expect(designEffect(Lottery.MEGA_SENA)).toBeCloseTo(54 / 59, 12);
    expect(bayesVerdict(-2)).toBe('FORTE_PRO_ACASO');
    expect(bayesVerdict(-0.7)).toBe('MODERADA_PRO_ACASO');
    expect(bayesVerdict(0)).toBe('INCONCLUSIVO');
    expect(bayesVerdict(0.7)).toBe('MODERADA_CONTRA_ACASO');
    expect(bayesVerdict(2)).toBe('FORTE_CONTRA_ACASO');
  });
  it('trajetória vazia é neutra', () => {
    expect(bayesTrajectory(Lottery.MEGA_SENA, []).anytimeP).toBe(1);
  });
});
