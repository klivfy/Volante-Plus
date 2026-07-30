'use client';

import { useEffect, useState } from 'react';
import { fetchNextDraw } from '../services/caixaApi';
import { Lottery, NextDrawInfo } from '../types/domain';

/** O próximo concurso muda no máximo uma vez por semana — não vale reconsultar a cada render. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry {
  data: NextDrawInfo | null;
  timestamp: number;
}

/** Cache em módulo: compartilhado entre todos os componentes que usam o hook. */
const cache = new Map<Lottery, CacheEntry>();

export interface UseNextDrawResult {
  data: NextDrawInfo | null;
  loading: boolean;
  /** `true` quando a busca terminou sem sucesso (API indisponível ou não configurada). */
  error: boolean;
}

function freshEntry(lottery: Lottery): CacheEntry | undefined {
  const entry = cache.get(lottery);
  return entry && Date.now() - entry.timestamp < CACHE_TTL_MS ? entry : undefined;
}

function stateFromCache(lottery: Lottery): UseNextDrawResult {
  const cached = freshEntry(lottery);
  return cached
    ? { data: cached.data, loading: false, error: cached.data === null }
    : { data: null, loading: true, error: false };
}

/** Busca e cacheia o próximo concurso da loteria, revalidando a cada `CACHE_TTL_MS`. */
export function useNextDraw(lottery: Lottery): UseNextDrawResult {
  const [state, setState] = useState<UseNextDrawResult>(() => stateFromCache(lottery));
  // WHY (ajuste durante a renderização, não em efeito): ao trocar de loteria
  // precisamos refletir o cache (ou o estado de loading) imediatamente, sem
  // esperar o primeiro commit do efeito — é o padrão recomendado pelo React
  // para "ajustar estado quando uma prop muda", em vez de um setState síncrono
  // dentro do corpo do efeito.
  const [trackedLottery, setTrackedLottery] = useState(lottery);
  if (lottery !== trackedLottery) {
    setTrackedLottery(lottery);
    setState(stateFromCache(lottery));
  }

  useEffect(() => {
    if (freshEntry(lottery)) {
      return;
    }

    let cancelled = false;
    fetchNextDraw(lottery).then((data) => {
      cache.set(lottery, { data, timestamp: Date.now() });
      if (!cancelled) {
        setState({ data, loading: false, error: data === null });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lottery]);

  return state;
}
