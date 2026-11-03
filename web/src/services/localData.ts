/**
 * Direitos do titular sobre dados locais (LGPD Art. 18) — self-service.
 *
 * O Volante+ não tem contas nem servidor de dados pessoais: tudo que o
 * titular gera fica NO DISPOSITIVO (IndexedDB `volante-plus`, localStorage,
 * sessionStorage). Isso desloca os direitos de acesso/portabilidade/eliminação
 * para o próprio app — esta camada implementa os três:
 *
 * - Acesso/portabilidade: `buildLocalDataExport()` devolve um JSON
 *   interoperável com TODO o conteúdo local (Art. 18, II e V).
 * - Eliminação: `clearLocalData()` apaga de forma imediata e irreversível
 *   (Art. 18, VI) — inclui desinscrever o push, revogar consentimentos e
 *   limpar o cache offline do PWA.
 * - Informação: `describeLocalData()` resume o que existe, para a tela de
 *   privacidade mostrar antes de pedir qualquer ação.
 *
 * Storages e `caches` são injetáveis: os testes rodam em `node` com
 * `fake-indexeddb` (mesmo padrão de `db.test.ts`, importado lá) e stubs de
 * Storage — nada de `fake-indexeddb` no bundle de produção.
 */
import { db, ConfigRecord, PerformanceRecord } from './db';
import { Draw, Lottery } from '../types/domain';
import { readConsent, ConsentState } from './consent';

/** Interface mínima de Storage — permite stubs nos testes (ambiente `node`). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Interface mínima de CacheStorage — o cache offline do PWA também é dado local. */
export type CacheStorageLike = Pick<CacheStorage, 'keys' | 'delete'>;

export interface LocalDataSummary {
  /** Concursos salvos por modalidade (dados PÚBLICOS das loterias, não pessoais). */
  draws: Record<Lottery, number>;
  /** Registros de desempenho em cache (backtest manual/análise automática). */
  performances: number;
  /** Registros de configuração/sincronização. */
  config: number;
  /** Chaves presentes no localStorage (consentimento, splash, etc.). */
  localStorageKeys: string[];
  /** Chaves presentes no sessionStorage. */
  sessionStorageKeys: string[];
  /** Caches do service worker (ativos offline). */
  caches: string[];
}

const ALL_LOTTERIES = Object.values(Lottery);

function storageKeys(storage: StorageLike | null | undefined): string[] {
  if (!storage) return [];
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys.sort();
}

function defaultStorages(): { localStorage: StorageLike | null; sessionStorage: StorageLike | null } {
  if (typeof window === 'undefined') return { localStorage: null, sessionStorage: null };
  return { localStorage: window.localStorage, sessionStorage: window.sessionStorage };
}

/** Storages opcionais injetáveis — padrão em produção: `window.*` e `caches`. */
export interface LocalDataStorages {
  localStorage?: StorageLike | null;
  sessionStorage?: StorageLike | null;
  caches?: CacheStorageLike | null;
}

/** Resumo do que o app guarda no dispositivo — para exibição na tela de privacidade. */
export async function describeLocalData(storages: LocalDataStorages = {}): Promise<LocalDataSummary> {
  const fallback = storages.localStorage === undefined && storages.sessionStorage === undefined;
  const { localStorage, sessionStorage } = fallback
    ? defaultStorages()
    : { localStorage: storages.localStorage ?? null, sessionStorage: storages.sessionStorage ?? null };
  const cacheStorage = storages.caches ?? (typeof caches !== 'undefined' ? caches : null);

  const draws = {} as Record<Lottery, number>;
  for (const lottery of ALL_LOTTERIES) {
    draws[lottery] = await db.draws.where('lottery').equals(lottery).count();
  }

  let cacheNames: string[] = [];
  if (cacheStorage) {
    try {
      cacheNames = await cacheStorage.keys();
    } catch {
      cacheNames = [];
    }
  }

  return {
    draws,
    performances: await db.performances.count(),
    config: await db.config.count(),
    localStorageKeys: storageKeys(localStorage),
    sessionStorageKeys: storageKeys(sessionStorage),
    caches: cacheNames.sort(),
  };
}

export interface LocalDataExport {
  /** Identificador do esquema — consumidores externos podem validar antes de parsear. */
  schema: 'volante-plus/local-data';
  version: 1;
  generatedAt: string;
  /** Decisão de consentimento registrada (ou `null` = não decidido). */
  consent: ConsentState | null;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB: {
    draws: Draw[];
    performances: PerformanceRecord[];
    config: ConfigRecord[];
  };
}

function storageEntries(storage: StorageLike | null | undefined): Record<string, string> {
  const entries: Record<string, string> = {};
  if (!storage) return entries;
  for (const key of storageKeys(storage)) {
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

/**
 * Monta o pacote completo de dados locais do titular, pronto para
 * serializar em JSON e baixar como arquivo (formato interoperável — LGPD
 * Art. 18, II e V).
 */
export async function buildLocalDataExport(storages: LocalDataStorages = {}): Promise<LocalDataExport> {
  const fallback = storages.localStorage === undefined && storages.sessionStorage === undefined;
  const { localStorage, sessionStorage } = fallback
    ? defaultStorages()
    : { localStorage: storages.localStorage ?? null, sessionStorage: storages.sessionStorage ?? null };

  return {
    schema: 'volante-plus/local-data',
    version: 1,
    generatedAt: new Date().toISOString(),
    // `readConsent` com storage inexistente devolve null — que é exatamente a
    // semântica de "não decidido" que o export deve retratar.
    consent: readConsent(localStorage),
    localStorage: storageEntries(localStorage),
    sessionStorage: storageEntries(sessionStorage),
    indexedDB: {
      draws: await db.draws.toArray(),
      performances: await db.performances.toArray(),
      config: await db.config.toArray(),
    },
  };
}

export interface ClearOptions {
  /** Desinscrever o push (endpoint no processo do servidor). Padrão: `true`. */
  unsubscribePush?: boolean;
  /** Apagar também os caches offline do service worker. Padrão: `true`. */
  clearCaches?: boolean;
  /** Injetáveis para testes; em produção caem em `window.*` / `caches`. */
  localStorage?: StorageLike | null;
  sessionStorage?: StorageLike | null;
  caches?: CacheStorageLike | null;
}

/**
 * Eliminação imediata e irreversível de TODO dado local do titular:
 * IndexedDB, localStorage, sessionStorage, caches offline e inscrição de
 * push. O consentimento também é removido — na próxima visita o banner
 * repergunta do zero (revogação com efeito imediato, Art. 18, § 5º).
 *
 * NÃO apaga dados no Sentry/Plausible: esses fornecedores têm retenção
 * própria descrita na política (docs/CONFORMIDADE-LGPD.md).
 */
export async function clearLocalData(options: ClearOptions = {}): Promise<void> {
  const { unsubscribePush = true, clearCaches = true } = options;
  const fallback = options.localStorage === undefined && options.sessionStorage === undefined;
  const { localStorage, sessionStorage } = fallback
    ? defaultStorages()
    : { localStorage: options.localStorage ?? null, sessionStorage: options.sessionStorage ?? null };
  const cacheStorage = options.caches ?? (typeof caches !== 'undefined' ? caches : null);

  if (unsubscribePush) {
    try {
      const { unsubscribeFromPush } = await import('./pushService');
      await unsubscribeFromPush();
    } catch {
      // Push é best-effort: a eliminação local não pode depender dele.
    }
  }

  await db.delete();

  for (const storage of [localStorage, sessionStorage]) {
    if (!storage) continue;
    const keys = storageKeys(storage);
    for (const key of keys) storage.removeItem(key);
  }

  if (clearCaches && cacheStorage) {
    try {
      const names = await cacheStorage.keys();
      await Promise.all(names.map((name) => cacheStorage.delete(name)));
    } catch {
      // Cache é reconstruído pelo service worker — falha aqui é inofensiva.
    }
  }
}
