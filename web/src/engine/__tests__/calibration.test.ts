import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import {
  CALIBRATION_CATALOG,
  smokeEntries,
  SMOKE_HISTORY_LENGTH,
  SMOKE_RUNS,
  SMOKE_SEED_BASE,
} from '../calibration/catalog';
import { honestHistory, lotterySpec } from '../calibration/honestHistory';
import {
  CALIBRATION_LOTTERY,
  CALIBRATION_SIGNALS,
  hitsToPerformances,
  runSmokeCalibration,
  WALK_FORWARD_BACKTEST_SEED,
  WALK_FORWARD_CUT_CONFIG,
  wilsonInterval,
} from '../calibration/runner';
import { multiCutWalkForward, stabilityAnalysis } from '../walkForwardMulti';

/**
 * Teste do harness de calibração (Fase 1 do plano de confiabilidade).
 *
 * O que está em jogo aqui não é a aleatoriedade — os sorteios são eventos
 * aleatórios independentes e nada os prevê —, e sim a régua: o harness mede
 * falso-positivo de métodos estatísticos sobre históricos honestos com
 * semente pública, e precisa ser determinístico, cobrir o catálogo e ser
 * sensível o bastante para reprovar um método mal calibrado de propósito.
 */

describe('honestHistory', () => {
  it('é determinístico: mesma semente produz o mesmo histórico', () => {
    const a = honestHistory(Lottery.MEGA_SENA, 50, 7);
    const b = honestHistory(Lottery.MEGA_SENA, 50, 7);
    expect(a).toEqual(b);
  });

  it('produz sorteios válidos para cada modalidade', () => {
    for (const lottery of [
      Lottery.MEGA_SENA,
      Lottery.MAIS_MILIONARIA,
      Lottery.QUINA,
    ]) {
      const spec = lotterySpec(lottery);
      const draws = honestHistory(lottery, 30, 99);
      expect(draws).toHaveLength(30);
      for (const draw of draws) {
        expect(draw.lottery).toBe(lottery);
        expect(draw.numbers).toHaveLength(spec.drawn);
        expect(new Set(draw.numbers).size).toBe(spec.drawn);
        expect(draw.numbers.every((n) => n >= 1 && n <= spec.universe)).toBe(true);
        const trevos = draw.trevos;
        const trevoSpec = spec.trevos;
        if (trevoSpec && trevos) {
          expect(trevos).toHaveLength(trevoSpec.drawn);
          expect(trevos.every((t) => t >= 1 && t <= trevoSpec.universe)).toBe(true);
        } else {
          expect(trevos).toBeUndefined();
        }
        expect(draw.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('contagens por dezena somam draws × sorteadas (hitsToPerformances)', () => {
    const draws = honestHistory(Lottery.MEGA_SENA, 100, 123);
    const performances = hitsToPerformances(Lottery.MEGA_SENA, draws);
    const totalHits = performances.reduce((sum, row) => sum + row.hitCount, 0);
    expect(totalHits).toBe(100 * 6);
    expect(performances).toHaveLength(60);
  });
});

describe('wilsonInterval', () => {
  it('intervalo de referência: 50/400 ≈ [0,097; 0,162]', () => {
    const ci = wilsonInterval(50, 400);
    expect(ci.lower).toBeGreaterThan(0.09);
    expect(ci.upper).toBeLessThan(0.17);
    expect(ci.lower).toBeLessThan(0.125);
    expect(ci.upper).toBeGreaterThan(0.125);
  });

  it('rejeita entradas absurdas', () => {
    expect(() => wilsonInterval(5, 0)).toThrow();
    expect(() => wilsonInterval(-1, 10)).toThrow();
    expect(() => wilsonInterval(11, 10)).toThrow();
  });
});

describe('contrato de calibração', () => {
  it('todo método smoke tem adaptador e loteria de referência', () => {
    for (const entry of smokeEntries()) {
      expect(CALIBRATION_SIGNALS[entry.method], entry.method).toBeDefined();
      expect(CALIBRATION_LOTTERY[entry.method], entry.method).toBeDefined();
    }
  });

  it('loteria do runner bate com a do catálogo (toda chave registrada)', () => {
    const byMethod = new Map(CALIBRATION_CATALOG.map((e) => [e.method, e]));
    for (const [method, lottery] of Object.entries(CALIBRATION_LOTTERY)) {
      const entry = byMethod.get(method);
      expect(entry, method).toBeDefined();
      expect(entry?.lottery, method).toBe(lottery);
    }
  });

  it('exatamente os métodos marcados smoke são executados na fumaça', () => {
    const smokeIds = smokeEntries().map((e) => e.method).sort();
    expect(smokeIds).toHaveLength(5);
    expect(smokeIds).toContain('numberEvidence (dezenas)');
    expect(smokeIds).toContain('collisionTest');
  });
});

describe('calibração de fumaça (determinística, semente pública)', () => {
  const first = runSmokeCalibration();
  const second = runSmokeCalibration();

  it('é determinística: duas execuções produzem os mesmos vereditos', () => {
    expect(second).toEqual(first);
  });

  it('métodos calibrados passam na tolerância da fumaça (α + 5 p.p.)', () => {
    for (const result of first.results) {
      expect(result.runs).toBe(SMOKE_RUNS);
      expect(
        result.verdict,
        `${result.method}: FPR=${result.fpr.toFixed(3)} ` +
          `IC=[${result.ci.lower.toFixed(3)}, ${result.ci.upper.toFixed(3)}] ` +
          `limite=${result.bound}`,
      ).toBe('PASS');
    }
  });

  it('sonda mal calibrada (α = 0,5) é reprovada: a régua mede', () => {
    expect(first.probe.fpr).toBeGreaterThan(0.4);
    expect(first.probe.verdict).toBe('FAIL');
  });

  it('nenhum método calibrado sinaliza mais que a sonda', () => {
    for (const result of first.results) {
      expect(result.fpr).toBeLessThan(first.probe.fpr);
    }
  });

  it('semente base está registrada para reprodução externa', () => {
    expect(SMOKE_SEED_BASE).toBeGreaterThan(0);
    expect(SMOKE_HISTORY_LENGTH).toBeGreaterThanOrEqual(400);
  });
});

describe('adaptador do walk-forward (gate de CI, Fase 3)', () => {
  const signal = CALIBRATION_SIGNALS['walkForwardMulti (stabilityAnalysis)'];

  it('existe e tem loteria de referência registrada (catálogo)', () => {
    expect(signal).toBeDefined();
    expect(CALIBRATION_LOTTERY['walkForwardMulti (stabilityAnalysis)']).toBe(
      Lottery.MEGA_SENA,
    );
  });

  it('é determinístico: mesmo histórico produz o mesmo sinal', () => {
    const draws = honestHistory(Lottery.MEGA_SENA, SMOKE_HISTORY_LENGTH, 424242);
    const first = signal(draws);
    expect(signal(draws)).toBe(first);
  });

  it('produz cortes utilizáveis no histórico honesto (config do gate)', () => {
    // O padrão da UI (primeiro corte a 4 anos) não deixaria nenhum corte no
    // histórico sintético de ~3,3 anos; o adaptador usa firstCutoffYears = 1.
    const draws = honestHistory(Lottery.MEGA_SENA, SMOKE_HISTORY_LENGTH, 424242);
    const cuts = multiCutWalkForward(
      [...draws],
      Lottery.MEGA_SENA,
      { seed: WALK_FORWARD_BACKTEST_SEED },
      WALK_FORWARD_CUT_CONFIG,
    );
    expect(cuts.length).toBeGreaterThanOrEqual(4);
    for (const cut of cuts) {
      expect(cut.validationDraws).toBeGreaterThanOrEqual(WALK_FORWARD_CUT_CONFIG.minValidation);
      expect(cut.trainingDraws).toBeGreaterThan(0);
    }
    // Bonferroni pelo número de cortes — a afirmação do catálogo.
    const stability = stabilityAnalysis(cuts);
    expect(stability.correctedAlpha).toBeCloseTo(0.05 / cuts.length);
  });

  it('falso-positivo contido em N pequeno (veredito estrito é do gate, N = 2.000)', () => {
    // Semente pública do contrato: histórico i usa SMOKE_SEED_BASE + i.
    const N = 50;
    let signals = 0;
    for (let i = 0; i < N; i++) {
      if (signal(honestHistory(Lottery.MEGA_SENA, SMOKE_HISTORY_LENGTH, SMOKE_SEED_BASE + i))) {
        signals++;
      }
    }
    expect(signals / N).toBeLessThanOrEqual(0.1);
  });
});
