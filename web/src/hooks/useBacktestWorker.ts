'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BacktestReport, Lottery, NumberPerformance } from '../types/domain';
import type { BacktestWorkerRequest, BacktestWorkerResponse } from '../workers/backtest.worker';
import { acceptsResponse } from './workerGate';

export interface UseBacktestWorkerResult {
  result: NumberPerformance[] | null;
  trevoPerformances: NumberPerformance[] | null;
  /** Modalidade da resposta aceita mais recentemente (espelha `result`). */
  resultLottery: Lottery | null;
  /** Relatório completo, preenchido quando `run` recebe uma requisição `kind: 'backtest'`. */
  report: BacktestReport | null;
  /** Modalidade do relatório aceito mais recentemente (espelha `report`). */
  reportLottery: Lottery | null;
  loading: boolean;
  error: string | null;
  /** Envia uma nova análise ao worker; substitui `result`/`report`/`error` anteriores. */
  run: (request: BacktestWorkerRequest) => void;
}

/**
 * Instancia (uma vez, por montagem) o Web Worker de `analyzeBacktest` e expõe
 * seu ciclo de vida como estado React — a tela chama `run()` e observa
 * `loading`/`result`/`error`, sem lidar com `postMessage` diretamente.
 *
 * GATE DE RESPOSTAS: cada `run` recebe um `requestId` incremental e a resposta
 * ecoa o id do pedido que a originou (ver `workerGate.ts`). Respostas de
 * pedidos obsoletos — postados antes do mais recente — são descartadas sem
 * tocar o estado. Sem isso, trocar de modalidade com uma análise em voo
 * aplicava (e gravava em cache) o desempenho da modalidade anterior como se
 * fosse da atual, e o relatório novo da tela de backtesting podia ser
 * sobrescrito pelo relatório antigo que chegava depois.
 */
export function useBacktestWorker(): UseBacktestWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [result, setResult] = useState<NumberPerformance[] | null>(null);
  const [resultLottery, setResultLottery] = useState<Lottery | null>(null);
  const [trevoPerformances, setTrevoPerformances] = useState<NumberPerformance[] | null>(null);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [reportLottery, setReportLottery] = useState<Lottery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Id do pedido mais recente postado; toda resposta deve ecoá-lo. */
  const lastRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/backtest.worker.ts', import.meta.url));
    } catch (err) {
      // Construção pode falhar (CSP restritivo, ambiente sem suporte): a tela
      // precisa de um estado de erro acionável, não de um crash sem boundary.
      // setState síncrono em resposta a falha de sistema externo (construção
      // do Worker) é o padrão válido documentado em `usePerformanceCache`.
      workerRef.current = null;
      lastRequestIdRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        err instanceof Error ? err.message : 'Web Worker indisponível para análise de backtest',
      );
      return;
    }

    worker.onmessage = (event: MessageEvent<BacktestWorkerResponse>) => {
      // Resposta de um pedido obsoleto: ignora SEM tocar o estado — nem o
      // loading, que pertence ao pedido mais recente. Limpar aqui faria a tela
      // piscar de "Analisando…" para pronta enquanto o cálculo atual segue.
      if (!acceptsResponse(lastRequestIdRef.current, event.data)) return;
      setLoading(false);
      if (event.data.type === 'success') {
        setResult(event.data.performances);
        setResultLottery(event.data.lottery);
        setTrevoPerformances(event.data.trevoPerformances);
        setError(null);
      } else if (event.data.type === 'report') {
        setReport(event.data.report);
        setReportLottery(event.data.lottery);
        setError(null);
      } else {
        setError(event.data.message);
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      setLoading(false);
      setError(event.message);
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((request: BacktestWorkerRequest) => {
    const requestId = (lastRequestIdRef.current ?? 0) + 1;
    lastRequestIdRef.current = requestId;
    setError(null);
    setLoading(true);
    if (!workerRef.current) {
      // Postar num worker ausente seria um no-op silencioso: `loading` ficaria
      // preso em true e a tela em "Analisando…" para sempre. Estado honesto:
      setLoading(false);
      setError('Web Worker indisponível para análise de backtest');
      return;
    }
    workerRef.current.postMessage({ ...request, requestId });
  }, []);

  return { result, resultLottery, trevoPerformances, report, reportLottery, loading, error, run };
}
