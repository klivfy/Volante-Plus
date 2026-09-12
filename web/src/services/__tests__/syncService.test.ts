import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lottery } from '../../types/domain';
import * as caixaApi from '../caixaApi';
import { db, getDraws } from '../db';
import { registerBackgroundSync, syncAndCountNew, SYNC_INTERVAL_MS, syncIfStale, syncNow } from '../syncService';

beforeEach(async () => {
  await db.draws.clear();
  await db.config.clear();
  await db.config.put({ key: 'seedApplied', value: 'true' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const megaSenaDraw = {
  lottery: Lottery.MEGA_SENA,
  contestNumber: 1,
  date: '2024-01-01',
  numbers: [1, 2, 3, 4, 5, 6],
};

describe('syncNow', () => {
  it('salva o histórico de todas as loterias e registra o horário da sincronização', async () => {
    vi.spyOn(caixaApi, 'fetchDrawHistory').mockImplementation(async (lottery) =>
      lottery === Lottery.MEGA_SENA ? [megaSenaDraw] : [],
    );
    vi.spyOn(caixaApi, 'fetchNextDraw').mockResolvedValue(null);

    await syncNow();

    expect(await getDraws(Lottery.MEGA_SENA)).toEqual([megaSenaDraw]);
    const lastSync = await db.config.get('lastSyncAt');
    expect(lastSync).toBeDefined();
    expect(Number(lastSync?.value)).toBeCloseTo(Date.now(), -2);
  });

  it('não lança quando o histórico falha (API fora do ar)', async () => {
    vi.spyOn(caixaApi, 'fetchDrawHistory').mockResolvedValue(null);
    vi.spyOn(caixaApi, 'fetchNextDraw').mockResolvedValue(null);

    await expect(syncNow()).resolves.toBeUndefined();
    expect(await getDraws(Lottery.MEGA_SENA)).toEqual([]);
  });
});

describe('syncAndCountNew', () => {
  it('conta apenas os concursos realmente novos (saveDraws é idempotente)', async () => {
    await db.draws.put(megaSenaDraw);
    const novo = { ...megaSenaDraw, contestNumber: 2, date: '2024-01-08' };
    vi.spyOn(caixaApi, 'fetchDrawHistory').mockImplementation(async (lottery) =>
      lottery === Lottery.MEGA_SENA ? [megaSenaDraw, novo] : [],
    );
    vi.spyOn(caixaApi, 'fetchNextDraw').mockResolvedValue(null);

    const count = await syncAndCountNew();

    expect(count).toBe(1);
  });

  it('devolve 0 quando nada de novo chega', async () => {
    await db.draws.put(megaSenaDraw);
    vi.spyOn(caixaApi, 'fetchDrawHistory').mockImplementation(async (lottery) =>
      lottery === Lottery.MEGA_SENA ? [megaSenaDraw] : [],
    );
    vi.spyOn(caixaApi, 'fetchNextDraw').mockResolvedValue(null);

    expect(await syncAndCountNew()).toBe(0);
  });
});

describe('syncIfStale', () => {
  it('sincroniza quando nunca sincronizou antes', async () => {
    const syncSpy = vi.spyOn(caixaApi, 'fetchDrawHistory').mockResolvedValue([]);
    vi.spyOn(caixaApi, 'fetchNextDraw').mockResolvedValue(null);

    await syncIfStale();

    expect(syncSpy).toHaveBeenCalled();
  });

  it('não sincroniza de novo antes de SYNC_INTERVAL_MS', async () => {
    await db.config.put({ key: 'lastSyncAt', value: String(Date.now()) });
    const syncSpy = vi.spyOn(caixaApi, 'fetchDrawHistory').mockResolvedValue([]);

    await syncIfStale();

    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('sincroniza de novo depois de SYNC_INTERVAL_MS', async () => {
    await db.config.put({ key: 'lastSyncAt', value: String(Date.now() - SYNC_INTERVAL_MS - 1) });
    const syncSpy = vi.spyOn(caixaApi, 'fetchDrawHistory').mockResolvedValue([]);
    vi.spyOn(caixaApi, 'fetchNextDraw').mockResolvedValue(null);

    await syncIfStale();

    expect(syncSpy).toHaveBeenCalled();
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
      serviceWorker: {
        ready: Promise.resolve({ periodicSync: { register } }),
      },
    });

    const strategy = await registerBackgroundSync();

    expect(strategy).toBe('periodic-background-sync');
    expect(register).toHaveBeenCalledWith('volante-plus-sync', expect.objectContaining({ minInterval: SYNC_INTERVAL_MS }));
  });

  it('devolve "none" quando nenhuma das duas estratégias está disponível', async () => {
    vi.stubGlobal('navigator', { serviceWorker: undefined });

    const strategy = await registerBackgroundSync();

    expect(strategy).toBe('none');
  });
});
