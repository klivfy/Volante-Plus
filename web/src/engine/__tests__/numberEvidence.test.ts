import { describe, expect, it } from 'vitest';
import { Lottery, NumberPerformance } from '../../types/domain';
import { numberEvidence } from '../numberEvidence';
import { analyzeBacktest } from '../backtestAnalyzer';
import { createSeededRandom } from '../random';

function honestDraws(count: number, seed: number) {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const drawn = new Set<number>();
    while (drawn.size < 6) drawn.add(1 + random.nextInt(60));
    return { lottery: Lottery.MEGA_SENA, contestNumber: i + 1, date: '', numbers: [...drawn] };
  });
}

describe('numberEvidence', () => {
  it('sorteio honesto: falso-positivo global próximo de α=5% (Bonferroni)', () => {
    let flagged = 0;
    const seeds = 200;
    for (let seed = 1; seed <= seeds; seed++) {
      const perf = analyzeBacktest(honestDraws(1500, seed), Lottery.MEGA_SENA, 0);
      if (numberEvidence(Lottery.MEGA_SENA, perf).verdict === 'DESVIO_SIGNIFICATIVO') flagged++;
    }
    // Esperado ≲ 5% (10 de 200, dp ≈ 3). Sementes fixas: o teste é determinístico.
    // Limiar de 10% (20 de 200) ≈ +3 desvios — pega descalibração real sem ser frágil.
    expect(flagged / seeds).toBeLessThanOrEqual(0.1);
  });

  it('detecta uma dezena viciada de verdade', () => {
    const draws = honestDraws(1500, 3);
    // Vicia a dezena 17: aparece em 30% dos concursos em vez de 10%.
    const random = createSeededRandom(8);
    for (const draw of draws) {
      if (random.nextFloat() < 0.3 && !draw.numbers.includes(17)) draw.numbers[0] = 17;
    }
    const summary = numberEvidence(Lottery.MEGA_SENA, analyzeBacktest(draws, Lottery.MEGA_SENA, 0));
    expect(summary.verdict).toBe('DESVIO_SIGNIFICATIVO');
    expect(summary.rows.find((r) => r.number === 17)?.significant).toBe(true);
  });

  it('amostra pequena: recusa concluir', () => {
    const perf = analyzeBacktest(honestDraws(20, 1), Lottery.MEGA_SENA, 0);
    const summary = numberEvidence(Lottery.MEGA_SENA, perf);
    expect(summary.verdict).toBe('AMOSTRA_INSUFICIENTE');
    expect(summary.minimumDetectableRelativeBias).toBeNull();
    expect(summary.minimumDraws).toBe(50);
  });

  it('o viés mínimo detectável cai com mais concursos', () => {
    const few = numberEvidence(Lottery.MEGA_SENA, analyzeBacktest(honestDraws(300, 2), Lottery.MEGA_SENA, 0));
    const many = numberEvidence(Lottery.MEGA_SENA, analyzeBacktest(honestDraws(3000, 2), Lottery.MEGA_SENA, 0));
    expect(many.minimumDetectableRelativeBias!).toBeLessThan(few.minimumDetectableRelativeBias!);
  });

  it('sem histórico: insuficiente, sem quebrar', () => {
    const empty: NumberPerformance[] = [];
    expect(numberEvidence(Lottery.MEGA_SENA, empty).verdict).toBe('AMOSTRA_INSUFICIENTE');
  });
});
