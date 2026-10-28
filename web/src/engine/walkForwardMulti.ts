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
 * Adiciona `months` meses mantendo TODA a aritmética em UTC.
 *
 * WHY (UTC, não fuso local): as datas do histórico são strings 'YYYY-MM-DD',
 * que o JS parseia como UTC meia-noite. Misturar isso com `setMonth`/`setFullYear`
 * (que operam no fuso local) e `toISOString` (UTC de novo) desloca o corte em
 * 1 dia quando o dispositivo não está em UTC (ex.: UTC+5 faz Date('2014-03-01')
 * virar 2014-02-28T19:00Z; +4 anos virava '2018-02-28' em vez de '2018-03-01')
 * — o split treino/validação mudava com o fuso do usuário e o relatório deixava
 * de ser reproduzível. Clampa o dia ao último dia do mês destino (31/Jan + 1
 * mês = 28/29 Fev) para o avanço de cortes nunca derrapar para o mês seguinte.
 */
export function addMonthsUTC(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), daysInMonth)));
}

/** Data ISO 'YYYY-MM-DD' a partir dos componentes UTC (sem envolver fuso local). */
export function toUTCDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
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

  // Aritmética UTC pura: parsear 'YYYY-MM-DD' já produz UTC meia-noite, e os
  // incrementos abaixo nunca tocam métodos de fuso local (ver addMonthsUTC).
  const currentCutoff = addMonthsUTC(firstDate, firstCutoffYears * 12);

  const results: WalkForwardCutResult[] = [];

  while (currentCutoff.getTime() <= lastDate.getTime()) {
    const cutoffStr = toUTCDateString(currentCutoff);
    const training = sorted.filter((d) => d.date <= cutoffStr);
    const validation = sorted.filter((d) => d.date > cutoffStr);

    if (validation.length < minValidation || training.length === 0) {
      currentCutoff.setTime(addMonthsUTC(currentCutoff, stepMonths).getTime());
      continue;
    }

    let report: BacktestReport;
    try {
      report = runBacktest(lottery, training, validation, options);
    } catch {
      currentCutoff.setTime(addMonthsUTC(currentCutoff, stepMonths).getTime());
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

    currentCutoff.setTime(addMonthsUTC(currentCutoff, stepMonths).getTime());
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
  /** Alpha corrigido por Bonferroni (0.05 / totalCuts) aplicado aos cortes. */
  correctedAlpha: number;
  /**
   * Contagens após correção de Bonferroni — o padrão sob H0 é 0/0.
   *
   * WHY: o walk-forward testa N cortes contra o mesmo histórico; sem correção,
   * H0 prevê ~N/20 cortes "significativos" por puro acaso (40 cortes a 5% →
   * ~2 falsos positivos esperados). Comparar as contagens cruas com estas é o
   * que separa ruído de sinal (mesma lógica de `multipleComparisons.ts`, que
   * o benchmark de estratégias já usa).
   */
  significantAdvantageCorrected: number;
  significantDisadvantageCorrected: number;
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
      correctedAlpha: 0.05,
      significantAdvantageCorrected: 0,
      significantDisadvantageCorrected: 0,
    };
  }

  const advantages = results.map((r) => r.meanHits - r.expectedMeanHits);
  const positive = advantages.filter((a) => a > 0).length;
  const correctedAlpha = 0.05 / results.length;

  return {
    totalCuts: results.length,
    significantAdvantage: results.filter((r) => r.significant && r.meanHits > r.expectedMeanHits)
      .length,
    significantDisadvantage: results.filter(
      (r) => r.significant && r.meanHits < r.expectedMeanHits,
    ).length,
    meanAdvantage: advantages.reduce((a, b) => a + b, 0) / advantages.length,
    consistency: Math.max(positive, results.length - positive) / results.length,
    correctedAlpha,
    significantAdvantageCorrected: results.filter(
      (r) => r.pValue < correctedAlpha && r.meanHits > r.expectedMeanHits,
    ).length,
    significantDisadvantageCorrected: results.filter(
      (r) => r.pValue < correctedAlpha && r.meanHits < r.expectedMeanHits,
    ).length,
  };
}
