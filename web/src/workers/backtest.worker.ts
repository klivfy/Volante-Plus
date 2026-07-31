import { analyzeBacktest, analyzeTrevoBacktest, DEFAULT_SIMULATIONS_PER_NUMBER } from '../engine/backtestAnalyzer';
import { Draw, Lottery, NumberPerformance } from '../types/domain';

/**
 * Web Worker do `analyzeBacktest` — a análise varre até centenas de concursos
 * com centenas de rodadas de Monte Carlo por dezena, e rodar isso na thread
 * principal trava a UI durante o cálculo. O worker tira esse custo da thread
 * principal; a lógica em si continua em `engine/backtestAnalyzer.ts`, pura e
 * sem dependência de DOM/Worker, para poder ser testada diretamente.
 */

export interface BacktestWorkerRequest {
  draws: Draw[];
  lottery: Lottery;
  /** Rodadas de Monte Carlo por dezena; padrão `DEFAULT_SIMULATIONS_PER_NUMBER`. */
  simulationsPerDraw?: number;
}

export type BacktestWorkerResponse =
  | { type: 'success'; performances: NumberPerformance[]; trevoPerformances: NumberPerformance[] }
  | { type: 'error'; message: string };

/** Núcleo puro do worker — testável sem `self`/`postMessage`. */
export function computeBacktestAnalysis(
  request: BacktestWorkerRequest,
): BacktestWorkerResponse {
  try {
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
