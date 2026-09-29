import browser from 'webextension-polyfill';
import { Draw, Lottery, NumberPerformance } from '../../web/src/types/domain';

/**
 * Camada de persistência da extensão via `chrome.storage.local` (acessada
 * pelo shim `browser.*` do `webextension-polyfill` — Promises nativas em
 * Firefox, wrapper em Chrome/Edge).
 *
 * Por que não IndexedDB (Dexie), como no `web/`: o popup e o service worker de
 * background são dois contextos de execução separados que precisam ler/gravar
 * o mesmo estado (histórico sincronizado, badge). `chrome.storage.local` é
 * acessível diretamente dos dois sem precisar abrir/gerenciar uma conexão de
 * banco em cada um, e sobrevive ao service worker MV3 sendo descartado entre
 * eventos — exatamente o caso de uso que a API foi desenhada para cobrir.
 */

export interface StoredPerformance {
  performances: NumberPerformance[];
  trevoPerformances: NumberPerformance[];
  updatedAt: string;
  /** Último concurso usado na análise; cache com concurso menor que o histórico está defasado. */
  lastContest?: number;
}

interface StorageShape {
  draws?: Partial<Record<Lottery, Draw[]>>;
  performances?: Partial<Record<Lottery, StoredPerformance>>;
  lastSyncAt?: number;
}

async function readStorage<K extends keyof StorageShape>(key: K): Promise<StorageShape[K]> {
  const result = (await browser.storage.local.get(key)) as StorageShape;
  return result[key];
}

/** Histórico salvo de uma loteria, ordenado por concurso crescente (ou `[]` se nunca sincronizado). */
export async function getDraws(lottery: Lottery): Promise<Draw[]> {
  const draws = await readStorage('draws');
  return draws?.[lottery] ?? [];
}

/**
 * Upsert de concursos pela chave `contestNumber` (mesma semântica idempotente
 * do `saveDraws` do `web/`). Devolve quantos concursos eram realmente novos —
 * base para o badge do ícone.
 */
export async function saveDraws(lottery: Lottery, newDraws: Draw[]): Promise<number> {
  const draws = await readStorage('draws');
  const existing = draws?.[lottery] ?? [];
  const byContest = new Map(existing.map((draw) => [draw.contestNumber, draw]));

  let added = 0;
  for (const draw of newDraws) {
    if (!byContest.has(draw.contestNumber)) added++;
    byContest.set(draw.contestNumber, draw);
  }

  const merged = [...byContest.values()].sort((a, b) => a.contestNumber - b.contestNumber);
  await browser.storage.local.set({ draws: { ...draws, [lottery]: merged } });
  return added;
}

/** Desempenho cacheado da loteria, ou `undefined` se nunca foi calculado. */
export async function getPerformances(lottery: Lottery): Promise<StoredPerformance | undefined> {
  const performances = await readStorage('performances');
  return performances?.[lottery];
}

export async function savePerformances(
  lottery: Lottery,
  performances: NumberPerformance[],
  trevoPerformances: NumberPerformance[],
  lastContest?: number,
): Promise<void> {
  const existing = await readStorage('performances');
  await browser.storage.local.set({
    performances: {
      ...existing,
      [lottery]: { performances, trevoPerformances, updatedAt: new Date().toISOString(), lastContest },
    },
  });
}

export async function getLastSyncAt(): Promise<number | null> {
  const value = await readStorage('lastSyncAt');
  return typeof value === 'number' ? value : null;
}

export async function setLastSyncAt(timestamp: number): Promise<void> {
  await browser.storage.local.set({ lastSyncAt: timestamp });
}
