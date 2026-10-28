'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBacktestWorker } from './useBacktestWorker';
import { trackBacktestAnalysis } from '../services/analytics';
import { reportDbError, reportWorkerError, addBreadcrumb } from '../services/errorReporter';
import { getDraws, getLastContest, getPerformances, PerformanceRecord, savePerformances } from '../services/db';
import { HISTORY_UPDATED_EVENT } from '../services/syncService';
import { DEFAULT_SIMULATIONS_PER_NUMBER } from '../engine/backtestAnalyzer';
import { Lottery, NumberPerformance } from '../types/domain';

export interface UsePerformanceCacheResult {
  performances: NumberPerformance[];
  trevoPerformances: NumberPerformance[];
  /** Origem do cache atual — `undefined` enquanto nada foi carregado ainda. */
  source: PerformanceRecord['source'] | undefined;
  loading: boolean;
  error: string | null;
  /**
   * Roda `analyzeBacktest` no Web Worker sobre o histórico salvo e grava o
   * resultado como cache `auto` — perde para um cache `manual` já existente
   * (ver `savePerformances`).
   */
  refreshAuto: () => void;
}

/**
 * Lê o desempenho cacheado de uma loteria no IndexedDB e mantém esse cache
 * atualizado via `useBacktestWorker`, sem travar a UI.
 *
 * Prioridade: um cache `manual` (o usuário rodou um backtesting explícito e
 * mandou usar o resultado) nunca é sobrescrito por uma atualização `auto`
 * disparada por este hook — só por outro backtesting manual.
 */
export function usePerformanceCache(lottery: Lottery): UsePerformanceCacheResult {
  const [performances, setPerformances] = useState<NumberPerformance[]>([]);
  const [trevoPerformances, setTrevoPerformances] = useState<NumberPerformance[]>([]);
  const [source, setSource] = useState<PerformanceRecord['source'] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    result,
    trevoPerformances: workerTrevoPerformances,
    loading: workerLoading,
    error: workerError,
    run,
  } = useBacktestWorker();
  const pendingLotteryRef = useRef<Lottery | null>(null);
  /** Último concurso do histórico usado na análise em andamento (gravado junto do cache). */
  const pendingLastContestRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        addBreadcrumb(`Loading performances for ${lottery}`, { lottery: lottery.toString() });
        const cachedRecord = await getPerformances(lottery);
        if (cancelled) return;

        // Um cache `auto` gerado com menos concursos que os hoje salvos está
        // defasado (chegou concurso novo, ou o seed real substituiu o antigo):
        // recalcula. Um cache `manual` é uma janela escolhida pelo usuário e só
        // expira pelo TTL.
        const latestContest = await getLastContest(lottery);
        if (cancelled) return;
        const stale =
          cachedRecord?.source === 'auto' && (cachedRecord.lastContest ?? 0) < (latestContest ?? 0);
        const cached = stale ? undefined : cachedRecord;

        if (cached) {
          setPerformances(cached.performances);
          setTrevoPerformances(cached.trevoPerformances);
          setSource(cached.source);
          setLoading(false);
          trackBacktestAnalysis({
            lottery: lottery.toString(),
            source: cached.source,
          });
        } else {
          pendingLotteryRef.current = lottery;
          const draws = await getDraws(lottery);
          if (cancelled) return;
          pendingLastContestRef.current = draws.length ? draws[draws.length - 1].contestNumber : undefined;
          run({ draws, lottery, simulationsPerDraw: DEFAULT_SIMULATIONS_PER_NUMBER });
        }
      } catch (err) {
        if (cancelled) return;
        const errorMsg = err instanceof Error ? err.message : 'Failed to load performances';
        setError(errorMsg);
        reportDbError(err instanceof Error ? err : new Error(errorMsg), {
          table: `performances_${lottery}`,
          operation: 'load',
          tags: {
            lottery: lottery.toString(),
          },
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [lottery, run]);

  useEffect(() => {
    if (!result || pendingLotteryRef.current === null) return;
    const targetLottery = pendingLotteryRef.current;
    pendingLotteryRef.current = null;
    const trevos = workerTrevoPerformances ?? [];

    try {
      addBreadcrumb('Worker completed backtest analysis', {
        lottery: targetLottery.toString(),
        performanceCount: result.length,
      });

      // Synchronous setState calls in response to external system (worker) is a valid pattern
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPerformances(result);
      setTrevoPerformances(trevos);
      setSource('auto');
      setLoading(false);
      trackBacktestAnalysis({
        lottery: targetLottery.toString(),
        source: 'auto',
      });
      void savePerformances(targetLottery, result, trevos, {
        source: 'auto',
        lastContest: pendingLastContestRef.current,
      }).catch((err) => {
        reportDbError(err instanceof Error ? err : new Error('Failed to save performances'), {
          table: `performances_${targetLottery}`,
          operation: 'save',
          tags: {
            lottery: targetLottery.toString(),
            source: 'auto',
          },
        });
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to process worker result';
      reportWorkerError(err instanceof Error ? err : new Error(errorMsg), {
        workerType: 'backtest',
        messageType: 'result',
        tags: {
          lottery: targetLottery.toString(),
        },
      });
    }
  }, [result, workerTrevoPerformances]);

  const refreshAuto = useCallback(() => {
    pendingLotteryRef.current = lottery;
    setLoading(true);
    getDraws(lottery)
      .then((draws) => {
        pendingLastContestRef.current = draws.length ? draws[draws.length - 1].contestNumber : undefined;
        run({ draws, lottery, simulationsPerDraw: DEFAULT_SIMULATIONS_PER_NUMBER });
      })
      .catch((err) => {
        // Sem isto, uma falha do IndexedDB no refresh automático (ex.: evento
        // de sincronização com o banco indisponível) vira unhandled rejection
        // e o `loading` fica preso em `true`.
        const errorMsg = err instanceof Error ? err.message : 'Failed to load draws for refresh';
        setError(errorMsg);
        setLoading(false);
        reportDbError(err instanceof Error ? err : new Error(errorMsg), {
          table: `performances_${lottery}`,
          operation: 'refresh',
          tags: {
            lottery: lottery.toString(),
            source: 'auto',
          },
        });
      });
  }, [lottery, run]);

  // Concursos novos sincronizados com o app aberto: reanalisa na hora, sem
  // esperar a próxima abertura. Um backtest manual não é sobrescrito.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHistoryUpdated = (): void => {
      if (source !== 'manual') refreshAuto();
    };
    window.addEventListener(HISTORY_UPDATED_EVENT, onHistoryUpdated);
    return () => window.removeEventListener(HISTORY_UPDATED_EVENT, onHistoryUpdated);
  }, [source, refreshAuto]);

  return {
    performances,
    trevoPerformances,
    source,
    loading: loading || workerLoading,
    error: error ?? workerError,
    refreshAuto,
  };
}
