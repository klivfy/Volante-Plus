'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBacktestWorker } from './useBacktestWorker';
import { getDraws, getPerformances, PerformanceRecord, savePerformances } from '../services/db';
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

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      const cached = await getPerformances(lottery);
      if (cancelled) return;

      if (cached) {
        setPerformances(cached.performances);
        setTrevoPerformances(cached.trevoPerformances);
        setSource(cached.source);
        setLoading(false);
      } else {
        pendingLotteryRef.current = lottery;
        const draws = await getDraws(lottery);
        if (cancelled) return;
        run({ draws, lottery, simulationsPerDraw: DEFAULT_SIMULATIONS_PER_NUMBER });
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

    setPerformances(result);
    setTrevoPerformances(trevos);
    setSource('auto');
    setLoading(false);
    void savePerformances(targetLottery, result, trevos, { source: 'auto' });
  }, [result, workerTrevoPerformances]);

  const refreshAuto = useCallback(() => {
    pendingLotteryRef.current = lottery;
    setLoading(true);
    getDraws(lottery).then((draws) => {
      run({ draws, lottery, simulationsPerDraw: DEFAULT_SIMULATIONS_PER_NUMBER });
    });
  }, [lottery, run]);

  return {
    performances,
    trevoPerformances,
    source,
    loading: loading || workerLoading,
    error: error ?? workerError,
    refreshAuto,
  };
}
