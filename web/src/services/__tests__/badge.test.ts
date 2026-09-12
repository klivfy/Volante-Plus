import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBadge, isBadgingSupported, setBadge } from '../badge';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('badge — sem a Badging API', () => {
  it('isBadgingSupported é false quando navigator não tem setAppBadge', () => {
    vi.stubGlobal('navigator', {});
    expect(isBadgingSupported()).toBe(false);
  });

  it('setBadge/clearBadge não lançam sem a API', async () => {
    vi.stubGlobal('navigator', {});
    await expect(setBadge(3)).resolves.toBeUndefined();
    await expect(clearBadge()).resolves.toBeUndefined();
  });
});

describe('badge — com a Badging API', () => {
  it('setBadge(n>0) chama setAppBadge com a contagem', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });

    await setBadge(5);

    expect(isBadgingSupported()).toBe(true);
    expect(setAppBadge).toHaveBeenCalledWith(5);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('setBadge(0) limpa o badge', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });

    await setBadge(0);

    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });
});
