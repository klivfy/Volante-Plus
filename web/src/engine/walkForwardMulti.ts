import { BacktestReport, Draw, Lottery } from '../types/domain';
import { BacktestOptions, runBacktest } from './backtestEngine';
import { anyPrizeProbability } from './powerAnalysis';
import { binomialExactTest } from './statisticalTests';

/**
 * Walk-forward com múltiplos cortes de validação.
 *
 * `backtestEngine.ts` roda um único corte treino/validação. Um corte único é
 * arbitrário: a estratégia pode "funcionar" (ou "falhar") só porque aquele
 * ponto no tempo calhou favorável. Repetir o backtest em vários cortes
 * consecutivos mostra se o resultado é estável — o que a hipótese nula prevê
 * — ou se oscila de um jeito que sugira um efeito real.
 *
 * Reusa `runBacktest` sem alterá-lo: cada corte aqui é só mais uma chamada
 * dele com um `cutoffDate` diferente.
 */

export interface WalkForwardCutResult {
  cutoff: string;
  trainingDraws: number;
  validationDraws: number;
  meanHits: number;
  expectedMeanHits: number;
  prizeRate: number;
  pValue: number;
  significant: boolean;
}

/**
 * Executa o backtest em cortes sucessivos, avançando `stepMonths` a cada
 * iteração, a partir de `firstCutoffYears` anos após o primeiro concurso
 * disponível (janela mínima de treino) até `stepMonths` antes do último
 * concurso (garante ao menos `minValidation` concursos de validação).
 */
export function multiCutWalkForward(
  draws: Draw[],
  lottery: Lottery,
  options: BacktestOptions = {},
  config: { stepMonths?: number; minValidation?: number; firstCutoffYears?: number } = {},
): WalkForwardCutResult[] {
  const { stepMonths = 3, minValidation = 20, firstCutoffYears = 4 } = config;

  const sorted = [...draws]
    .filter((draw) => draw.lottery === lottery)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) return [];

  const firstDate = new Date(sorted[0].date);
  const lastDate = new Date(sorted[sorted.length - 1].date);
  const p0 = anyPrizeProbability(lottery);

  const currentCutoff = new Date(firstDate);
  currentCutoff.setFullYear(currentCutoff.getFullYear() + firstCutoffYears);

  const results: WalkForwardCutResult[] = [];

  while (currentCutoff <= lastDate) {
    const cutoffStr = currentCutoff.toISOString().slice(0, 10);
    const training = sorted.filter((d) => d.date <= cutoffStr);
    const validation = sorted.filter((d) => d.date > cutoffStr);

    if (validation.length < minValidation || training.length === 0) {
      currentCutoff.setMonth(currentCutoff.getMonth() + stepMonths);
      continue;
    }

    let report: BacktestReport;
    try {
      report = runBacktest(lottery, training, validation, options);
    } catch {
      currentCutoff.setMonth(currentCutoff.getMonth() + stepMonths);
      continue;
    }

    const { pValue } = binomialExactTest(report.prizeCount, report.totalBets, p0);

    results.push({
      cutoff: cutoffStr,
      trainingDraws: report.trainingDraws,
      validationDraws: report.validationDraws,
      meanHits: report.stats.mean,
      expectedMeanHits: report.expectedMeanHits,
      prizeRate: report.prizeRate,
      pValue,
      significant: pValue < 0.05,
    });

    currentCutoff.setMonth(currentCutoff.getMonth() + stepMonths);
  }

  return results;
}

export interface StabilityAnalysis {
  totalCuts: number;
  significantAdvantage: number;
  significantDisadvantage: number;
  /** Média de (acertos observados - esperados) entre todos os cortes. */
  meanAdvantage: number;
  /** Fração de cortes cujo sinal (vantagem/desvantagem) concorda com a maioria. */
  consistency: number;
}

/**
 * Resume os resultados de `multiCutWalkForward`: quantos cortes mostraram
 * vantagem/desvantagem significativa, e o quão consistente é o sinal.
 *
 * Interpretação (ver documento de origem):
 * - `consistency` alta sozinha não prova nada (pode ser viés estrutural).
 * - `significantAdvantage` e `significantDisadvantage` próximos e ambos
 *   pequenos é o padrão esperado sob H0 (ruído puro, sem vantagem real).
 */
export function stabilityAnalysis(results: WalkForwardCutResult[]): StabilityAnalysis {
  if (results.length === 0) {
    return {
      totalCuts: 0,
      significantAdvantage: 0,
      significantDisadvantage: 0,
      meanAdvantage: 0,
      consistency: 0,
    };
  }

  const advantages = results.map((r) => r.meanHits - r.expectedMeanHits);
  const positive = advantages.filter((a) => a > 0).length;

  return {
    totalCuts: results.length,
    significantAdvantage: results.filter((r) => r.significant && r.meanHits > r.expectedMeanHits)
      .length,
    significantDisadvantage: results.filter(
      (r) => r.significant && r.meanHits < r.expectedMeanHits,
    ).length,
    meanAdvantage: advantages.reduce((a, b) => a + b, 0) / advantages.length,
    consistency: Math.max(positive, results.length - positive) / results.length,
  };
}
