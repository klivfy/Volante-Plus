import { describe, expect, it } from 'vitest';
import { Draw, Lottery } from '../../types/domain';
import { collisionTest, overlapSpectrumTest, poissonUpperTail } from '../drawDependence';
import { createSeededRandom } from '../random';

function honest(count: number, seed: number): Draw[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const d = new Set<number>();
    while (d.size < 6) d.add(1 + random.nextInt(60));
    return { lottery: Lottery.MEGA_SENA, contestNumber: i + 1, date: '', numbers: [...d] };
  });
}

describe('poissonUpperTail', () => {
  it('valores exatos', () => {
    expect(poissonUpperTail(2, 0)).toBe(1);
    expect(poissonUpperTail(1, 1)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(poissonUpperTail(3, 2)).toBeCloseTo(1 - 4 * Math.exp(-3), 12);
  });
});

describe('collisionTest', () => {
  it('sem repetição: p = 1, nenhum alarme', () => {
    const r = collisionTest(Lottery.MEGA_SENA, honest(500, 1));
    expect(r.observed).toBe(0);
    expect(r.expected).toBeCloseTo((500 * 499) / 2 / 50063860, 12);
    expect(r.pValue).toBe(1);
  });
  it('detecta uma combinação duplicada (dado corrompido)', () => {
    const draws = honest(500, 2);
    draws[400] = { ...draws[400], numbers: [...draws[10].numbers].reverse() }; // mesma combinação, outra ordem
    const r = collisionTest(Lottery.MEGA_SENA, draws);
    expect(r.observed).toBe(1);
    expect(r.repeated).toEqual([[11, 401]]);
    expect(r.pValue).toBeCloseTo(1 - Math.exp(-r.expected), 12); // ≈ λ = 0,0025
    expect(r.pValue).toBeLessThan(0.01);
  });
});

describe('overlapSpectrumTest', () => {
  it('sorteio honesto não é rejeitado na maioria dos históricos', () => {
    let rejected = 0;
    const seeds = 12;
    for (let s = 1; s <= seeds; s++) {
      const r = overlapSpectrumTest(Lottery.MEGA_SENA, honest(300, 10 + s), {
        baselineRuns: 60,
        random: createSeededRandom(900 + s),
      });
      if (r.pValue < 0.05) rejected++;
    }
    expect(rejected).toBeLessThanOrEqual(3);
  });

  it('o espectro esperado soma o número de pares', () => {
    const r = overlapSpectrumTest(Lottery.MEGA_SENA, honest(100, 3), { baselineRuns: 1 });
    expect(r.expected.reduce((a, b) => a + b, 0)).toBeCloseTo(r.pairs, 6);
    expect(r.observed.reduce((a, b) => a + b, 0)).toBe(r.pairs);
  });

  it('detecta memória entre concursos (cada concurso reaproveita 3 dezenas do anterior)', () => {
    const random = createSeededRandom(5);
    const draws: Draw[] = [];
    let prev: number[] = [];
    for (let i = 0; i < 300; i++) {
      const d = new Set<number>(prev.slice(0, 3));
      while (d.size < 6) d.add(1 + random.nextInt(60));
      prev = [...d];
      draws.push({ lottery: Lottery.MEGA_SENA, contestNumber: i + 1, date: '', numbers: prev });
    }
    const r = overlapSpectrumTest(Lottery.MEGA_SENA, draws, {
      baselineRuns: 100,
      random: createSeededRandom(1),
    });
    expect(r.pValue).toBeLessThan(0.02);
  });

  it('detecta duplicação em massa (dado repetido)', () => {
    const base = honest(150, 8);
    const draws = [...base, ...base.map((d, i) => ({ ...d, contestNumber: 1000 + i }))];
    const r = overlapSpectrumTest(Lottery.MEGA_SENA, draws, {
      baselineRuns: 60,
      random: createSeededRandom(2),
    });
    expect(r.pValue).toBeLessThan(0.05);
  });

  it('Quina: dezenas altas (48 vs 80) não colidem por aliasing de bit (Onda 3)', () => {
    // A máscara antiga usava duas palavras de 30 bits — dezena 80 virava bit
    // 49, que em JS wrapa para o bit 17, o MESMO da dezena 48. Dois concursos
    // que compartilham nada apareciam com sobreposição fantasma.
    const quina = (contest: number, numbers: number[]): Draw => ({
      lottery: Lottery.QUINA,
      contestNumber: contest,
      date: '',
      numbers,
    });
    const draws = [quina(1, [1, 2, 3, 4, 80]), quina(2, [6, 7, 8, 9, 48])];
    const r = overlapSpectrumTest(Lottery.QUINA, draws, {
      baselineRuns: 10,
      random: createSeededRandom(3),
    });
    expect(r.observed[0]).toBe(1); // o único par não compartilha dezena alguma
    expect(r.observed[1]).toBe(0); // sem sobreposição fantasma de bit wrapado
  });
});
