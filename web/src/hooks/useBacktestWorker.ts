'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BacktestReport, Lottery, NumberPerformance } from '../types/domain';
import type { BacktestWorkerRequest, BacktestWorkerResponse } from '../workers/backtest.worker';

export interface UseBacktestWorkerResult {
  result: NumberPerformance[] | null;
  trevoPerformances: NumberPerformance[] | null;
  /** Loteria a que `result`/`trevoPerformances` pertencem. */
  resultLottery: Lottery | null;
  /** Relatório completo, preenchido quando `run` recebe uma requisição `kind: 'backtest'`. */
  report: BacktestReport | null;
  loading: boolean;
  error: string | null;
  /** Envia uma nova análise ao worker; substitui `result`/`report`/`error` anteriores. */
  run: (request: BacktestWorkerRequest) => void;
}

/**
 * True só para a resposta da requisição mais recente: uma resposta de
 * requisição já substituída por outra `run()` pertence a um pedido antigo
 * (talvez de outra loteria) e é descartada.
 */
export function isCurrentResponse(response: { requestId?: number }, latestRequestId: number): boolean {
  return response.requestId === latestRequestId;
}

/**
 * Instancia (uma vez, por montagem) o Web Worker de `analyzeBacktest` e expõe
 * seu ciclo de vida como estado React — a tela chama `run()` e observa
 * `loading`/`result`/`error`, sem lidar com `postMessage` diretamente.
 */
export function useBacktestWorker(): UseBacktestWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const latestRequestIdRef = useRef(0);
  const [result, setResult] = useState<NumberPerformance[] | null>(null);
  const [trevoPerformances, setTrevoPerformances] = useState<NumberPerformance[] | null>(null);
  const [resultLottery, setResultLottery] = useState<Lottery | null>(null);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/backtest.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<BacktestWorkerResponse>) => {
      if (!isCurrentResponse(event.data, latestRequestIdRef.current)) return;
      setLoading(false);
      if (event.data.type === 'success') {
        setResult(event.data.performances);
        setTrevoPerformances(event.data.trevoPerformances);
        setResultLottery(event.data.lottery);
        setError(null);
      } else if (event.data.type === 'report') {
        setReport(event.data.report);
        setError(null);
      } else {
        setError(event.data.message);
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      setLoading(false);
      setError(event.message);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((request: BacktestWorkerRequest) => {
    setError(null);
    setLoading(true);
    latestRequestIdRef.current += 1;
    workerRef.current?.postMessage({ ...request, requestId: latestRequestIdRef.current });
  }, []);

  return { result, trevoPerformances, resultLottery, report, loading, error, run };
}
