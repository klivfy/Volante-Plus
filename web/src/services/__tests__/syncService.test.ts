import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_SEED_META } from '../../data/history';
import { Draw, Lottery } from '../../types/domain';
import { db, getDraws, markHistorySeeded } from '../db';
import { DrawSource } from '../drawSources';
import {
  getHistorySummary,
  HISTORY_UPDATED_EVENT,
  LATEST_CHECK_INTERVAL_MS,
  registerBackgroundSync,
  SYNC_INTERVAL_MS,
  syncAndCountNew,
  syncIfStale,
  syncNow,
} from '../syncService';

const MEGA_LAST = HISTORY_SEED_META[Lottery.MEGA_SENA].lastContest;
const MAIS_LAST = HISTORY_SEED_META[Lottery.MAIS_MILIONARIA].lastContest;

function draw(lottery: Lottery, contestNumber: number): Draw {
  return {
    lottery,
    contestNumber,
    date: '2030-01-01',
    numbers: [1, 2, 3, 4, 5, 6],
    ...(lottery === Lottery.MAIS_MILIONARIA ? { trevos: [1, 2] } : {}),
  };
}

/** Fonte falsa: a Mega-Sena termina em `megaLatest`, a +Milionária em `maisLatest`. */
function fakeSource(megaLatest: number, maisLatest: number): DrawSource & { calls: string[] } {
  const calls: string[] = [];
  const latestOf = (l: Lottery) => (l === Lottery.MEGA_SENA ? megaLatest : maisLatest);
  return {
    name: 'fake',
    calls,
    latest: async (l) => (calls.push(`latest:${l}`), draw(l, latestOf(l))),
    byContest: async (l, n) => (calls.push(`byContest:${l}:${n}`), n <= latestOf(l) ? draw(l, n) : null),
  };
}

beforeEach(async () => {
  await db.draws.clear();
  await db.config.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('syncNow', () => {
  it('parte do seed completo e busca SÓ os concursos que faltam depois dele', async () => {
    const source = fakeSource(MEGA_LAST + 2, MAIS_LAST + 1);

    const reports = await syncNow({ sources: [source] });

    const mega = await getDraws(Lottery.MEGA_SENA);
    expect(mega[mega.length - 1].contestNumber).toBe(MEGA_LAST + 2);
    expect(mega.map((d) => d.contestNumber)).toEqual(mega.map((_, i) => i + 1)); // contíguo desde o 1
    const mais = await getDraws(Lottery.MAIS_MILIONARIA);
    expect(mais[mais.length - 1].contestNumber).toBe(MAIS_LAST + 1);
    expect(reports.map((r) => r.added)).toEqual([2, 1]);
    // Não rebaixou o histórico: só o concurso que faltava entre o seed e o último
    // (o último em si veio do pedido "latest"; a +Milionária só tinha o último a buscar).
    expect(source.calls.filter((c) => c.startsWith('byContest'))).toEqual([
      `byContest:${Lottery.MEGA_SENA}:${MEGA_LAST + 1}`,
    ]);
  });

  it('registra o horário e o último concurso conhecido', async () => {
    await syncNow({ sources: [fakeSource(MEGA_LAST, MAIS_LAST)] });

    expect(Number((await db.config.get('lastSyncAt'))?.value)).toBeCloseTo(Date.now(), -2);
    const summary = await getHistorySummary(Lottery.MEGA_SENA);
    expect(summary.latestKnown).toBe(MEGA_LAST);
    expect(summary.upToDate).toBe(true);
    expect(summary.complete).toBe(true);
  });

  it('não lança quando todas as fontes falham (sem rede) e mantém o seed', async () => {
    const dead: DrawSource = { name: 'dead', latest: async () => null, byContest: async () => null };

    const reports = await syncNow({ sources: [dead] });

    expect(reports.every((r) => r.reachable === false)).toBe(true);
    expect((await getDraws(Lottery.MEGA_SENA)).length).toBe(MEGA_LAST);
    expect((await getHistorySummary(Lottery.MEGA_SENA)).reachable).toBe(false);
  });

  it('preenche lacunas ANTIGAS, não só concursos novos', async () => {
    await markHistorySeeded();
    await db.draws.bulkPut([draw(Lottery.MEGA_SENA, 1), draw(Lottery.MEGA_SENA, 2), draw(Lottery.MEGA_SENA, 5)]);

    await syncNow({ sources: [fakeSource(5, 0)] });

    const have = (await getDraws(Lottery.MEGA_SENA)).map((d) => d.contestNumber);
    expect(have).toEqual([1, 2, 3, 4, 5]);
  });

  it('anuncia a atualização em window quando entram concursos novos', async () => {
    const listener = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => (listener(e.type), true) });

    await syncNow({ sources: [fakeSource(MEGA_LAST + 1, MAIS_LAST)] });

    expect(listener).toHaveBeenCalledWith(HISTORY_UPDATED_EVENT);
  });
});

describe('syncAndCountNew', () => {
  it('conta apenas os concursos realmente novos', async () => {
    expect(await syncAndCountNew({ sources: [fakeSource(MEGA_LAST + 3, MAIS_LAST + 1)] })).toBe(4);
  });

  it('devolve 0 quando nada de novo chega', async () => {
    expect(await syncAndCountNew({ sources: [fakeSource(MEGA_LAST, MAIS_LAST)] })).toBe(0);
  });
});

describe('syncIfStale', () => {
  it('sincroniza quando nunca sincronizou antes', async () => {
    const source = fakeSource(MEGA_LAST, MAIS_LAST);
    await syncIfStale({ sources: [source] });
    expect(source.calls.length).toBeGreaterThan(0);
  });

  it('não sincroniza de novo antes de LATEST_CHECK_INTERVAL_MS', async () => {
    await db.config.put({ key: 'lastSyncAt', value: String(Date.now()) });
    const source = fakeSource(MEGA_LAST, MAIS_LAST);
    await syncIfStale({ sources: [source] });
    expect(source.calls).toEqual([]);
  });

  it('sincroniza de novo depois de LATEST_CHECK_INTERVAL_MS', async () => {
    await db.config.put({ key: 'lastSyncAt', value: String(Date.now() - LATEST_CHECK_INTERVAL_MS - 1) });
    const source = fakeSource(MEGA_LAST, MAIS_LAST);
    await syncIfStale({ sources: [source] });
    expect(source.calls.length).toBeGreaterThan(0);
  });
});

describe('registerBackgroundSync', () => {
  it('usa chrome.alarms quando disponível (contexto de extensão)', async () => {
    const addListener = vi.fn();
    const create = vi.fn();
    vi.stubGlobal('chrome', { alarms: { create, onAlarm: { addListener } } });

    const strategy = await registerBackgroundSync();

    expect(strategy).toBe('chrome-alarms');
    expect(create).toHaveBeenCalledWith('volante-plus-sync', expect.objectContaining({ periodInMinutes: expect.any(Number) }));
    expect(addListener).toHaveBeenCalled();
  });

  it('usa Periodic Background Sync quando suportado pelo service worker', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ periodicSync: { register } }) },
    });

    const strategy = await registerBackgroundSync();

    expect(strategy).toBe('periodic-background-sync');
    expect(register).toHaveBeenCalledWith('volante-plus-sync', expect.objectContaining({ minInterval: SYNC_INTERVAL_MS }));
  });

  it('devolve "none" quando nenhuma das duas estratégias está disponível', async () => {
    vi.stubGlobal('navigator', { serviceWorker: undefined });
    expect(await registerBackgroundSync()).toBe('none');
  });
});
