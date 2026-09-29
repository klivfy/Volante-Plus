'use client';

import { useEffect, useState } from 'react';
import { getHistorySummary, HISTORY_UPDATED_EVENT, HistorySummary } from '../services/syncService';
import { Lottery } from '../types/domain';

/**
 * Situação do histórico da loteria (último concurso, completude, atualização),
 * relida quando a sincronização grava concursos novos e a cada minuto (para
 * refletir o fim de uma sincronização que não gravou nada, mas atualizou o
 * "consultado há").
 */
export function useHistorySummary(lottery: Lottery): HistorySummary | null {
  const [summary, setSummary] = useState<{ lottery: Lottery; value: HistorySummary } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      void getHistorySummary(lottery)
        .then((value) => {
          if (!cancelled) setSummary({ lottery, value });
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(HISTORY_UPDATED_EVENT, load);
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener(HISTORY_UPDATED_EVENT, load);
      clearInterval(timer);
    };
  }, [lottery]);

  // Só vale o resumo da loteria atual (evita mostrar o da anterior por um instante).
  return summary && summary.lottery === lottery ? summary.value : null;
}
