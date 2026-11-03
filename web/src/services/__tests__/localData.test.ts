import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, saveDraws, savePerformances } from '../db';
import { Draw, Lottery } from '../../types/domain';
import { CONSENT_STORAGE_KEY } from '../consent';
import {
  buildLocalDataExport,
  clearLocalData,
  describeLocalData,
  StorageLike,
} from '../localData';

/**
 * Testes do painel de direitos do titular (Art. 18): resumo, exportação
 * interoperável e eliminação irreversível dos dados locais.
 * IndexedDB é o `fake-indexeddb` (mesmo padrão de db.test.ts); os storages
 * do browser são stubs em memória.
 */

function draw(contestNumber: number, lottery: Lottery = Lottery.MEGA_SENA): Draw {
  return { lottery, contestNumber, date: '2026-01-15', numbers: [1, 2, 3, 4, 5, 6] };
}

function stubStorage(
  initial: Record<string, string> = {},
): StorageLike & { dump: () => Record<string, string>; clear: () => void } {
  const map = new Map(Object.entries(initial));
  return {
    // `length` como getter: a iteração de chaves em localData lê length
    // DEPOIS das mutações — valor congelado quebraria o laço.
    get length() {
      return map.size;
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => void map.clear(),
    dump: () => Object.fromEntries(map),
  };
}

function stubCacheStorage(initial: string[] = []) {
  const names = new Set(initial);
  return {
    keys: async () => Array.from(names),
    delete: async (name: string) => names.delete(name),
    has: (name: string) => names.has(name),
  };
}

const local = stubStorage({ volante_splash_shown: 'true', unrelated: 'keep' });
const session = stubStorage({ volante_splash_shown: 'true' });
const caches = stubCacheStorage(['next-pwa-workbox-precache-v1', 'caixa-api']);

// Aviso: `unrelated` em local simula chave de outra futura integração — a
// eliminação local apaga TODO o storage da origem (é o que o titular pede ao
// clicar em "apagar tudo").

beforeEach(async () => {
  // clearLocalData dos testes anteriores pode ter DELETADO o banco: Dexie
  // não reabre sozinho depois de db.delete() — garantir um banco aberto e
  // vazio antes de cada teste.
  if (!db.isOpen()) await db.open();
  await db.draws.clear();
  await db.performances.clear();
  await db.config.clear();
  local.clear();
  local.setItem('volante_splash_shown', 'true');
  local.setItem('unrelated', 'keep');
  session.clear();
  session.setItem('volante_splash_shown', 'true');
});

afterEach(async () => {
  // clearLocalData faz db.delete() e o Dexie NÃO reabre sozinho depois dele
  // (a UI real recarrega a página; nos testes, reabrimos explicitamente).
  if (!db.isOpen()) await db.open();
});

describe('describeLocalData', () => {
  it('resume contagens por tabela e chaves de storage', async () => {
    await saveDraws([draw(2800), draw(2801, Lottery.QUINA)]);
    await savePerformances(Lottery.MEGA_SENA, []);
    await db.config.put({ key: 'lastSyncAt', value: '1730000000000' });

    const summary = await describeLocalData({ localStorage: local, sessionStorage: session, caches });
    expect(summary.draws[Lottery.MEGA_SENA]).toBe(1);
    expect(summary.draws[Lottery.QUINA]).toBe(1);
    expect(summary.draws[Lottery.MAIS_MILIONARIA]).toBe(0);
    expect(summary.performances).toBe(1);
    expect(summary.config).toBe(1);
    expect(summary.localStorageKeys).toContain('volante_splash_shown');
    expect(summary.sessionStorageKeys).toEqual(['volante_splash_shown']);
    expect(summary.caches).toContain('caixa-api');
  });
});

describe('buildLocalDataExport (portabilidade — Art. 18, II e V)', () => {
  it('empacota IndexedDB + storages + consentimento num JSON completo', async () => {
    await saveDraws([draw(2800)]);
    local.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      version: 1,
      analiticos: true,
      diagnosticos: false,
      marketing: false,
      decidedAt: '2026-11-04T10:00:00.000Z',
    }));

    const data = await buildLocalDataExport({ localStorage: local, sessionStorage: session, caches });
    expect(data.schema).toBe('volante-plus/local-data');
    expect(data.version).toBe(1);
    expect(new Date(data.generatedAt).getTime()).not.toBeNaN();
    expect(data.consent?.analiticos).toBe(true);
    expect(data.indexedDB.draws).toHaveLength(1);
    expect(data.indexedDB.draws[0].contestNumber).toBe(2800);
    expect(data.localStorage['volante_splash_shown']).toBe('true');
    expect(data.sessionStorage['volante_splash_shown']).toBe('true');
    // Serializável de verdade (o download é JSON.stringify disto).
    expect(() => JSON.stringify(data)).not.toThrow();
  });

  it('sem decisão de consentimento, o export retrata null (não decidido)', async () => {
    const data = await buildLocalDataExport({ localStorage: local, sessionStorage: session, caches });
    expect(data.consent).toBeNull();
  });
});

describe('clearLocalData (eliminação — Art. 18, VI)', () => {
  it('apaga IndexedDB, storages e caches; consentimento vai junto', async () => {
    await saveDraws([draw(2800)]);
    await savePerformances(Lottery.QUINA, []);
    await db.config.put({ key: 'lastSyncAt', value: '1' });
    local.setItem(CONSENT_STORAGE_KEY, '{"version":1,"analiticos":true,"diagnosticos":true,"marketing":true,"decidedAt":"x"}');

    await clearLocalData({
      unsubscribePush: false, // sem SW/push em ambiente node — coberto no e2e
      localStorage: local,
      sessionStorage: session,
      caches,
    });

    await db.open(); // db.delete() fecha; reabrir recria o esquema vazio
    expect(await db.draws.count()).toBe(0);
    expect(await db.performances.count()).toBe(0);
    expect(await db.config.count()).toBe(0);
    expect(Object.keys(local.dump())).toHaveLength(0);
    expect(Object.keys(session.dump())).toHaveLength(0);
    expect(await caches.keys()).toHaveLength(0);
  });

  it('é idempotente: segunda chamada sem nada apagado não lança', async () => {
    await clearLocalData({ unsubscribePush: false, localStorage: local, sessionStorage: session, caches });
    // db.delete() fecha o banco e Dexie NÃO reabre automaticamente depois
    // dele — na UI real a página recarrega (novo Dexie); no teste, reabrimos.
    await db.open();
    await clearLocalData({ unsubscribePush: false, localStorage: local, sessionStorage: session, caches });
    await db.open();
    expect(await db.draws.count()).toBe(0);
  });
});
