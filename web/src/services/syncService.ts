import { fetchDrawHistory, fetchNextDraw } from './caixaApi';
import { db, saveDraws } from './db';
import { Lottery } from '../types/domain';

/**
 * Sincronização incremental do histórico de concursos.
 *
 * O gatilho varia por ambiente — Periodic Background Sync no PWA,
 * `chrome.alarms` na extensão — mas a ação de sincronizar em si (esta
 * função) é a mesma nos três: busca o histórico e o próximo concurso na API
 * da Caixa e faz upsert no IndexedDB (`saveDraws`, já idempotente pela chave
 * composta `[lottery+contestNumber]`). Nunca lança: falha de rede vira
 * `null` em `fetchDrawHistory`/`fetchNextDraw`, e o app segue com o que já
 * tem localmente (seed ou sincronização anterior).
 */

/** Intervalo mínimo entre sincronizações completas do fallback ao abrir o app. */
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

const LAST_SYNC_CONFIG_KEY = 'lastSyncAt';
const ALARM_NAME = 'volante-plus-sync';

const ALL_LOTTERIES = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

async function getLastSyncAt(): Promise<number | null> {
  const record = await db.config.get(LAST_SYNC_CONFIG_KEY);
  if (!record) return null;
  const parsed = Number(record.value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function setLastSyncAt(timestamp: number): Promise<void> {
  await db.config.put({ key: LAST_SYNC_CONFIG_KEY, value: String(timestamp) });
}

/**
 * Sincroniza o histórico de todas as loterias suportadas. Concursos que
 * falharem (histórico indisponível, ou próximo concurso indisponível) são
 * simplesmente ignorados — a sincronização é best-effort, nunca lança.
 */
export async function syncNow(): Promise<void> {
  for (const lottery of ALL_LOTTERIES) {
    const history = await fetchDrawHistory(lottery);
    if (history && history.length > 0) {
      await saveDraws(history);
    }
    // `fetchNextDraw` só informa data/prêmio estimado do próximo concurso —
    // não é um `Draw` realizado, então não entra em `saveDraws`; quem
    // precisa dele (`useNextDraw`) já busca sob demanda.
    await fetchNextDraw(lottery);
  }
  await setLastSyncAt(Date.now());
}

/**
 * Sincroniza apenas se a última sincronização foi há mais de
 * `SYNC_INTERVAL_MS` (ou nunca aconteceu) — fallback usado ao abrir o app,
 * para os casos em que nem Periodic Background Sync nem `chrome.alarms`
 * dispararam (navegador não suporta, permissão negada, app ficou fechado).
 */
export async function syncIfStale(): Promise<void> {
  const lastSyncAt = await getLastSyncAt();
  if (lastSyncAt !== null && Date.now() - lastSyncAt < SYNC_INTERVAL_MS) {
    return;
  }
  await syncNow();
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
