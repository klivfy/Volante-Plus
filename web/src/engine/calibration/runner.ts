import { Draw, Lottery, NumberPerformance } from '../../types/domain';
import { collisionTest } from '../drawDependence';
import { frequencyFairnessTest } from '../fairnessTests';
import { numberEvidence } from '../numberEvidence';
import { DrawSpace, drawSpace } from '../prizeRules';
import { createSeededRandom } from '../random';
import {
  CalibrationEntry,
  FPR_TOLERANCE_PTS,
  SMOKE_HISTORY_LENGTH,
  SMOKE_RUNS,
  SMOKE_SEED_BASE,
  SMOKE_TOLERANCE_PTS,
  smokeEntries,
} from './catalog';
import { honestHistory } from './honestHistory';

/**
 * Overrides de execução da calibração de fumaça. Omitido = valores do
 * contrato (N = 300, tolerância de 5 p.p.) — usados pelo teste de unidade.
 * O relatório de auditoria (Fase 2) passa N alto e tolerância estrita;
 * nenhum valor do contrato é duplicado fora de `catalog.ts`.
 */
export interface SmokeOptions {
  runs?: number;
  historyLength?: number;
  seedBase?: number;
  tolerancePts?: number;
}

/**
 * Runner de calibração: mede o falso-positivo real de cada método do
 * contrato rodando-o sobre históricos honestos (modelo nulo verdadeiro) e
 * compara o intervalo de Wilson do FPR medido com o α declarado.
 *
 * Critério do contrato (gate de CI, Fase 3): limite superior do IC de Wilson
 * a 95% ≤ α + 2 p.p., com N = 2.000 históricos. O teste de unidade usa N
 * menor com tolerância larga (α + 5 p.p.) — ele prova o mecanismo
 * (determinismo, sensibilidade, registro), não substitui o gate estrito.
 *
 * Por intervalo e não pela proporção pontual: uma execução individual raramente
 * mente, mas nunca decide — a decisão usa a incerteza da medição.
 */

export interface CalibrationResult {
  method: string;
  alpha: number;
  runs: number;
  signals: number;
  /** Proporção pontual de sinalizações (FPR medido). */
  fpr: number;
  /** IC de Wilson a 95% do FPR. */
  ci: { lower: number; upper: number };
  /** Limite aceitável para o limite superior do IC (α + tolerância). */
  bound: number;
  verdict: 'PASS' | 'FAIL';
}

/** Z de 97,5% (bicaudal 95%). */
const Z_95 = 1.959963984540054;

export function wilsonInterval(
  successes: number,
  n: number,
  z: number = Z_95,
): { lower: number; upper: number } {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`n deve ser inteiro positivo (recebido: ${n})`);
  }
  if (successes < 0 || successes > n) {
    throw new RangeError(`successes fora de [0, n] (${successes}/${n})`);
  }
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

/**
 * Converte um histórico honesto em contagens por dezena/trevo
 * (`NumberPerformance[]`), formato que `numberEvidence` consome. Só
 * `number`/`hitCount` importam para o teste; os demais campos são neutros.
 */
export function hitsToPerformances(
  lottery: Lottery,
  draws: readonly Draw[],
  space: DrawSpace = 'numbers',
): NumberPerformance[] {
  const spec = drawSpace(lottery, space);
  const counts = new Array<number>(spec.universe + 1).fill(0);
  for (const draw of draws) {
    const values =
      space === 'trevos'
        ? (draw.trevos ?? [])
        : draw.numbers;
    for (const value of values) {
      if (value >= 1 && value <= spec.universe) counts[value]++;
    }
  }
  const performances: NumberPerformance[] = [];
  for (let number = 1; number <= spec.universe; number++) {
    performances.push({
      number,
      hitCount: counts[number],
      simulatedHitRate: 0,
      weight: 0,
      tier: 'low',
    });
  }
  return performances;
}

/** Assinatura de um adaptador de método: true = sinaliza "anomalia". */
export type CalibrationSignal = (draws: readonly Draw[]) => boolean;

/** Adaptadores por identificador de catálogo (cobertura 100% exigida). */
export const CALIBRATION_SIGNALS: Record<string, CalibrationSignal> = {
  'numberEvidence (dezenas)': (draws) =>
    numberEvidence(Lottery.MEGA_SENA, hitsToPerformances(Lottery.MEGA_SENA, draws))
      .verdict === 'DESVIO_SIGNIFICATIVO',
  'numberEvidence (trevos)': (draws) =>
    numberEvidence(
      Lottery.MAIS_MILIONARIA,
      hitsToPerformances(Lottery.MAIS_MILIONARIA, draws, 'trevos'),
      'trevos',
    ).verdict === 'DESVIO_SIGNIFICATIVO',
  collisionTest: (draws) => collisionTest(Lottery.MEGA_SENA, draws).pValue < 0.05,
  frequencyFairnessTest: (draws) =>
    !frequencyFairnessTest([...draws], Lottery.MEGA_SENA).isFair,
  'chiSquareGlobal (numberEvidence)': (draws) =>
    numberEvidence(Lottery.MEGA_SENA, hitsToPerformances(Lottery.MEGA_SENA, draws))
      .chiSquare.pValue < 0.05,
  'walkForwardMulti (stabilityAnalysis)': () => {
    // Medido apenas no gate de CI (Fase 3): o walk-forward por histórico é
    // caro demais para o teste de unidade. Sua ausência aqui é de custo, não
    // de contrato — o gate estrito o cobre com N = 2.000.
    throw new Error('adaptador de walk-forward roda só no gate de CI (Fase 3)');
  },
};

/**
 * Roda o Monte Carlo de um método: N históricos honestos (sementes
 * seedBase..seedBase+N−1) e contagem de sinalizações.
 */
export function calibrate(
  entry: Pick<CalibrationEntry, 'method' | 'alpha'> & { alpha: number },
  options: {
    runs: number;
    historyLength: number;
    seedBase: number;
    tolerancePts: number;
    signal: CalibrationSignal;
  },
): CalibrationResult {
  const { runs, historyLength, seedBase, tolerancePts, signal } = options;
  const lottery = CALIBRATION_LOTTERY[entry.method];
  if (!lottery) {
    throw new Error(`método sem loteria de referência no runner: ${entry.method}`);
  }
  let signals = 0;
  for (let i = 0; i < runs; i++) {
    const draws = honestHistory(lottery, historyLength, seedBase + i);
    if (signal(draws)) signals++;
  }
  const fpr = signals / runs;
  const ci = wilsonInterval(signals, runs);
  const bound = entry.alpha + tolerancePts / 100;
  return {
    method: entry.method,
    alpha: entry.alpha,
    runs,
    signals,
    fpr,
    ci,
    bound,
    verdict: ci.upper <= bound ? 'PASS' : 'FAIL',
  };
}

/** Loteria de referência por método (espelha o catálogo). */
export const CALIBRATION_LOTTERY: Record<string, Lottery> = {
  'numberEvidence (dezenas)': Lottery.MEGA_SENA,
  'numberEvidence (trevos)': Lottery.MAIS_MILIONARIA,
  collisionTest: Lottery.MEGA_SENA,
  frequencyFairnessTest: Lottery.MEGA_SENA,
  'chiSquareGlobal (numberEvidence)': Lottery.MEGA_SENA,
};

/**
 * Método-sonda deliberadamente mal calibrado (α = 0,5): sinaliza por moeda.
 * Prova que a régua mede — se o harness não o reprovar, o harness está errado.
 */
export function calibrateProbe(
  runs: number,
  seedBase: number,
  tolerancePts: number = SMOKE_TOLERANCE_PTS,
): CalibrationResult {
  let signals = 0;
  for (let i = 0; i < runs; i++) {
    const rng = createSeededRandom(seedBase + i);
    if (rng.nextFloat() < 0.5) signals++;
  }
  const fpr = signals / runs;
  const ci = wilsonInterval(signals, runs);
  const bound = 0.05 + tolerancePts / 100;
  return {
    method: 'sonda (α = 0,5, mal calibrado de propósito)',
    alpha: 0.5,
    runs,
    signals,
    fpr,
    ci,
    bound,
    verdict: ci.upper <= bound ? 'PASS' : 'FAIL',
  };
}

/**
 * Calibração de fumaça: todos os métodos `smoke` do catálogo + sonda.
 * Determinística — mesma semente base, mesmos vereditos, sempre.
 * A sonda usa sempre a tolerância larga da fumaça (prova do mecanismo, não
 * veredito de contrato) independentemente do N pedido.
 */
export function runSmokeCalibration(options: SmokeOptions = {}): {
  results: CalibrationResult[];
  probe: CalibrationResult;
  options: Required<SmokeOptions>;
} {
  const resolved: Required<SmokeOptions> = {
    runs: options.runs ?? SMOKE_RUNS,
    historyLength: options.historyLength ?? SMOKE_HISTORY_LENGTH,
    seedBase: options.seedBase ?? SMOKE_SEED_BASE,
    tolerancePts: options.tolerancePts ?? SMOKE_TOLERANCE_PTS,
  };
  const entries = smokeEntries();
  const results = entries.map((entry) => {
    const signal = CALIBRATION_SIGNALS[entry.method];
    if (!signal || entry.alpha === null) {
      throw new Error(`método smoke sem adaptador/α: ${entry.method}`);
    }
    return calibrate({ method: entry.method, alpha: entry.alpha }, {
      runs: resolved.runs,
      historyLength: resolved.historyLength,
      seedBase: resolved.seedBase,
      tolerancePts: resolved.tolerancePts,
      signal,
    });
  });
  return {
    results,
    probe: calibrateProbe(resolved.runs, resolved.seedBase),
    options: resolved,
  };
}

/** Tolerância estrita do contrato (gate de CI, N = 2.000). */
export const CONTRACT_TOLERANCE_PTS = FPR_TOLERANCE_PTS;
