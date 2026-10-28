import { Lottery } from '../types/domain';
import { db, getLastContest, getStoredContests, saveDraws, seedIfEmpty } from './db';
import { defaultSources, DrawSource } from './drawSources';
import { analyzeHistory, HistoryStatus, syncLottery, SyncReport } from './historySync';

/**
 * Sincronização incremental do histórico de concursos.
 *
 * O gatilho varia por ambiente — Periodic Background Sync no PWA,
 * `chrome.alarms` na extensão, abertura/retorno ao app — mas a ação é a mesma:
 * garantir o seed embutido (concursos 1..N desde a geração do app), descobrir o
 * último concurso realizado e buscar SÓ o que falta (`historySync.syncLottery`).
 * Nunca lança: falha de rede vira relatório `reachable: false` e o app segue
 * com o que já tem.
 */

/** Intervalo pedido ao Periodic Background Sync (o navegador pode espaçar mais). */
export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Intervalo mínimo entre verificações ao abrir/voltar ao app. A verificação é
 * barata (uma chamada do "último concurso" quando nada mudou), então é frequente:
 * sorteios saem 2 a 3 vezes por semana e o usuário deve vê-los logo.
 */
export const LATEST_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Evento disparado em `window` quando a sincronização grava concursos novos. */
export const HISTORY_UPDATED_EVENT = 'volante:history-updated';

const LAST_SYNC_CONFIG_KEY = 'lastSyncAt';
const STATUS_KEY_PREFIX = 'historyStatus:';
const ALARM_NAME = 'volante-plus-sync';

const ALL_LOTTERIES = Object.values(Lottery);

export interface SyncOptions {
  /** Fontes a tentar, em ordem; padrão `defaultSources()`. Injetável para testes. */
  sources?: DrawSource[];
}

async function getLastSyncAt(): Promise<number | null> {
  const record = await db.config.get(LAST_SYNC_CONFIG_KEY);
  if (!record) return null;
  const parsed = Number(record.value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function setLastSyncAt(timestamp: number): Promise<void> {
  await db.config.put({ key: LAST_SYNC_CONFIG_KEY, value: String(timestamp) });
}

interface StoredSyncStatus {
  latestKnown: number | null;
  checkedAt: number;
  reachable: boolean;
  source: string | null;
}

async function saveSyncStatus(report: SyncReport): Promise<void> {
  const previous = await readSyncStatus(report.lottery);
  const status: StoredSyncStatus = {
    // Sem rede, mantém o último concurso conhecido em vez de apagá-lo.
    latestKnown: report.latest ?? previous?.latestKnown ?? null,
    checkedAt: Date.now(),
    reachable: report.reachable,
    source: report.source,
  };
  await db.config.put({ key: STATUS_KEY_PREFIX + report.lottery, value: JSON.stringify(status) });
}

/** Grava o status sem derrubar a sincronização: o registro é diagnóstico, não operacional. */
async function saveSyncStatusBestEffort(report: SyncReport): Promise<void> {
  try {
    await saveSyncStatus(report);
  } catch {
    // IndexedDB indisponível — o relatório em memória já cobre o chamador.
  }
}

async function readSyncStatus(lottery: Lottery): Promise<StoredSyncStatus | null> {
  const record = await db.config.get(STATUS_KEY_PREFIX + lottery);
  if (!record) return null;
  try {
    return JSON.parse(record.value) as StoredSyncStatus;
  } catch {
    return null;
  }
}

/** Situação do histórico de uma loteria: completude, atualização e última consulta. */
export interface HistorySummary extends HistoryStatus {
  /** Data (ISO) do último concurso salvo. */
  lastDate: string | null;
  /** Epoch ms da última consulta à fonte; `null` se nunca consultou. */
  checkedAt: number | null;
  /** A última consulta alcançou alguma fonte. */
  reachable: boolean | null;
  /** O banco tem o último concurso realizado conhecido. */
  upToDate: boolean;
}

export async function getHistorySummary(lottery: Lottery): Promise<HistorySummary> {
  await seedIfEmpty();
  const stored = await readSyncStatus(lottery);
  const contests = await getStoredContests(lottery);
  const status = analyzeHistory(lottery, contests, stored?.latestKnown ?? null);
  const last = await getLastContest(lottery);
  const lastRow = last === null ? undefined : await db.draws.get([lottery, last]);
  return {
    ...status,
    lastDate: lastRow?.date ?? null,
    checkedAt: stored?.checkedAt ?? null,
    reachable: stored ? stored.reachable : null,
    upToDate:
      status.lastContest !== null &&
      (stored?.latestKnown ?? 0) > 0 &&
      status.lastContest >= (stored?.latestKnown ?? 0),
  };
}

function announceHistoryUpdate(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
  }
}

/**
 * Sincroniza todas as loterias suportadas: garante o seed, descobre o último
 * concurso e preenche o que faltar (concursos novos e lacunas antigas). Devolve
 * um relatório por loteria; nunca lança.
 */
export async function syncNow(options: SyncOptions = {}): Promise<SyncReport[]> {
  const sources = options.sources ?? defaultSources();
  try {
    await seedIfEmpty();
  } catch {
    // Sem seed (IndexedDB indisponível?) a sincronização ainda tenta preencher tudo.
  }
  const reports: SyncReport[] = [];
  for (const lottery of ALL_LOTTERIES) {
    const report = await syncLottery(lottery, {
      sources,
      storedContests: getStoredContests,
      save: saveDraws,
    });
    await saveSyncStatusBestEffort(report);
    reports.push(report);
  }
  try {
    await setLastSyncAt(Date.now());
  } catch {
    // Mesmo contrato: falha ao carimbar o timestamp não deve lançar além daqui.
  }
  if (reports.some((r) => r.added > 0)) announceHistoryUpdate();
  return reports;
}

/**
 * Como `syncNow`, mas devolve quantos concursos novos entraram no banco — a
 * base para atualizar o badge do ícone ("N novos sorteios"). Compara a
 * contagem total de `draws` antes e depois; como `saveDraws` é idempotente pela
 * chave composta, só concursos realmente inéditos aumentam a contagem.
 */
export async function syncAndCountNew(options: SyncOptions = {}): Promise<number> {
  try {
    await seedIfEmpty();
  } catch {
    // Mesmo tratamento de `syncNow`: sem seed, a sincronização ainda tenta.
  }
  const before = await db.draws.count();
  await syncNow(options);
  const after = await db.draws.count();
  return Math.max(0, after - before);
}

/**
 * Sincroniza se a última verificação foi há mais de `LATEST_CHECK_INTERVAL_MS`
 * (ou nunca aconteceu) — chamada ao abrir o app e ao voltar a ele, para os
 * casos em que Periodic Background Sync / `chrome.alarms` não dispararam.
 */
export async function syncIfStale(options: SyncOptions = {}): Promise<void> {
  const lastSyncAt = await getLastSyncAt();
  if (lastSyncAt !== null && Date.now() - lastSyncAt < LATEST_CHECK_INTERVAL_MS) {
    return;
  }
  await syncNow(options);
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
}

interface ServiceWorkerRegistrationWithPeriodicSync extends ServiceWorkerRegistration {
  periodicSync?: PeriodicSyncManager;
}

/** Estratégia usada para agendar a sincronização em background, para diagnóstico/telemetria. */
export type BackgroundSyncStrategy = 'periodic-background-sync' | 'chrome-alarms' | 'none';

interface ChromeAlarmsLike {
  alarms: {
    create(name: string, options: { periodInMinutes: number }): void;
    onAlarm: {
      addListener(callback: (alarm: { name: string }) => void): void;
    };
  };
}

function getChromeAlarms(): ChromeAlarmsLike['alarms'] | null {
  const globalChrome = (globalThis as { chrome?: Partial<ChromeAlarmsLike> }).chrome;
  return globalChrome?.alarms ? (globalChrome.alarms as ChromeAlarmsLike['alarms']) : null;
}

/**
 * Registra a sincronização em background para o ambiente atual:
 *
 * - **Extensão** (`chrome.alarms` disponível): cria um alarme recorrente que,
 *   ao disparar, roda `syncNow()` — funciona com o service worker do MV3
 *   suspenso entre disparos.
 * - **PWA** (Periodic Background Sync suportado pelo navegador): registra a
 *   tag `volante-plus-sync`; o disparo real acontece no service worker
 *   (`public/sw.js`), que precisa escutar `periodicsync` e chamar esta mesma
 *   lógica de sincronização.
 * - **Nenhum dos dois**: não registra nada — `syncIfStale()` ao abrir o app
 *   cobre esse caso.
 */
export async function registerBackgroundSync(): Promise<BackgroundSyncStrategy> {
  const alarms = getChromeAlarms();
  if (alarms) {
    alarms.create(ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MS / 60_000 });
    alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) {
        void syncNow();
      }
    });
    return 'chrome-alarms';
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistrationWithPeriodicSync;
      if (registration.periodicSync) {
        await registration.periodicSync.register('volante-plus-sync', {
          minInterval: SYNC_INTERVAL_MS,
        });
        return 'periodic-background-sync';
      }
    } catch {
      // Permissão negada, `periodicSync` inexistente em runtime apesar do
      // typeof, ou nenhum service worker ativo — cai no fallback silencioso.
    }
  }

  return 'none';
}
