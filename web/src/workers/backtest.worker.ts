import { analyzeBacktest, analyzeTrevoBacktest, DEFAULT_SIMULATIONS_PER_NUMBER } from '../engine/backtestAnalyzer';
import { runBacktest } from '../engine/backtestEngine';
import { BacktestReport, Draw, Lottery, NumberPerformance } from '../types/domain';

/**
 * Web Worker de backtesting — a análise varre até centenas de concursos com
 * centenas de rodadas de Monte Carlo por dezena, e o relatório completo ainda
 * gera jogos contra cada concurso de validação. Rodar isso na thread principal
 * trava a UI durante o cálculo. O worker tira esse custo da thread principal; a
 * lógica em si continua em `engine/` (pura, sem dependência de DOM/Worker) para
 * poder ser testada diretamente.
 *
 * Dois tipos de requisição, discriminados por `kind`:
 * - `analyze` (padrão): só o desempenho das dezenas (`usePerformanceCache`).
 * - `backtest`: o relatório completo com validação (tela de backtesting).
 */

/** Só o desempenho das dezenas — usada pelo cache de performances. */
export interface BacktestAnalyzeRequest {
  kind?: 'analyze';
  draws: Draw[];
  lottery: Lottery;
  /** Rodadas de Monte Carlo por dezena; padrão `DEFAULT_SIMULATIONS_PER_NUMBER`. */
  simulationsPerDraw?: number;
}

/** Relatório completo: treina no histórico até o corte e valida no restante. */
export interface BacktestReportRequest {
  kind: 'backtest';
  lottery: Lottery;
  trainingDraws: Draw[];
  validationDraws: Draw[];
  /** Jogos gerados por concurso de validação; padrão do motor (`MIN_GAMES`). */
  gamesPerContest?: number;
  /** Semente opcional para tornar o relatório reproduzível. */
  seed?: number;
}

export type BacktestWorkerRequest = BacktestAnalyzeRequest | BacktestReportRequest;

export type BacktestWorkerResponse =
  | { type: 'success'; performances: NumberPerformance[]; trevoPerformances: NumberPerformance[] }
  | { type: 'report'; report: BacktestReport }
  | { type: 'error'; message: string };

/** Núcleo puro do worker — testável sem `self`/`postMessage`. */
export function computeBacktestAnalysis(
  request: BacktestWorkerRequest,
): BacktestWorkerResponse {
  try {
    if (request.kind === 'backtest') {
      const report = runBacktest(request.lottery, request.trainingDraws, request.validationDraws, {
        gamesPerContest: request.gamesPerContest,
        seed: request.seed,
      });
      return { type: 'report', report };
    }

    const simulationsPerDraw = request.simulationsPerDraw ?? DEFAULT_SIMULATIONS_PER_NUMBER;
    const performances = analyzeBacktest(request.draws, request.lottery, simulationsPerDraw);
    // `analyzeTrevoBacktest` já devolve `[]` para loterias sem trevos — sempre
    // seguro chamar, sem precisar de um `hasTrevos` aqui no worker.
    const trevoPerformances = analyzeTrevoBacktest(request.draws, request.lottery, simulationsPerDraw);
    return { type: 'success', performances, trevoPerformances };
  } catch (error) {
    return {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// WHY (guarda de ambiente): este módulo é importado tanto pelo worker real
// (browser) quanto pelo teste unitário (Node, sem `self`) — só registra o
// listener quando existe um escopo de worker de fato.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (event: MessageEvent<BacktestWorkerRequest>) => {
    self.postMessage(computeBacktestAnalysis(event.data));
  };
}
