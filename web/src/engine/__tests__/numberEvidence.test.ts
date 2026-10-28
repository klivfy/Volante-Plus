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

  it('cada linha traz o IC de Wilson 95% da frequência (Fase 4, clareza da UI)', () => {
    const summary = numberEvidence(Lottery.MEGA_SENA, analyzeBacktest(honestDraws(1500, 3), Lottery.MEGA_SENA, 0));
    expect(summary.draws).toBe(1500);
    for (const row of summary.rows) {
      expect(row.ciLower).not.toBeNull();
      expect(row.ciUpper).not.toBeNull();
      const share = row.hitCount / summary.draws;
      // O intervalo contém a proporção observada e é ordenado.
      expect(row.ciLower!).toBeLessThanOrEqual(share);
      expect(row.ciUpper!).toBeGreaterThanOrEqual(share);
      expect(row.ciLower!).toBeLessThan(row.ciUpper!);
      expect(row.ciLower!).toBeGreaterThanOrEqual(0);
      expect(row.ciUpper!).toBeLessThanOrEqual(1);
      // Com n=1500 e p=0,1, a meia-largura fica na casa de 1,5 p.p.
      const halfWidth = (row.ciUpper! - row.ciLower!) / 2;
      expect(halfWidth).toBeGreaterThan(0.005);
      expect(halfWidth).toBeLessThan(0.04);
    }
  });

  it('IC de referência (Wilson): 15 acertos em 150 concursos = [0,0615; 0,1584]', () => {
    // Performances sintéticas: 60 dezenas × 15 acertos = 900 = 150×6 →
    // draws = 150 e toda linha tem exatamente a contagem de referência.
    const perf: NumberPerformance[] = Array.from({ length: 60 }, (_, i) => ({
      number: i + 1,
      hitCount: 15,
      simulatedHitRate: 0.1,
      weight: 1,
      tier: 'mid' as const,
    }));
    const summary = numberEvidence(Lottery.MEGA_SENA, perf);
    expect(summary.draws).toBe(150);
    expect(summary.verdict).toBe('COMPATIVEL_COM_ACASO');
    // Referência: Wilson 95% de (15, 150), calculado à mão.
    for (const row of summary.rows) {
      expect(row.ciLower!).toBeCloseTo(0.061541, 4);
      expect(row.ciUpper!).toBeCloseTo(0.158435, 4);
    }
  });

  it('sem histórico: IC fica nulo, não quebra', () => {
    const summary = numberEvidence(Lottery.MEGA_SENA, []);
    expect(summary.rows).toHaveLength(0);
  });
});
