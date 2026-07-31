'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NumberPerformance } from '../types/domain';
import type { BacktestWorkerRequest, BacktestWorkerResponse } from '../workers/backtest.worker';

export interface UseBacktestWorkerResult {
  result: NumberPerformance[] | null;
  loading: boolean;
  error: string | null;
  /** Envia uma nova análise ao worker; substitui `result`/`error` anteriores. */
  run: (request: BacktestWorkerRequest) => void;
}

/**
 * Instancia (uma vez, por montagem) o Web Worker de `analyzeBacktest` e expõe
 * seu ciclo de vida como estado React — a tela chama `run()` e observa
 * `loading`/`result`/`error`, sem lidar com `postMessage` diretamente.
 */
export function useBacktestWorker(): UseBacktestWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [result, setResult] = useState<NumberPerformance[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/backtest.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<BacktestWorkerResponse>) => {
      setLoading(false);
      if (event.data.type === 'success') {
        setResult(event.data.performances);
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
    workerRef.current?.postMessage(request);
  }, []);

  return { result, loading, error, run };
}
