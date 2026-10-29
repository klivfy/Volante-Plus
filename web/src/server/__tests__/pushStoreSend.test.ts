import { afterEach, describe, expect, it, vi } from 'vitest';
import webpush, { WebPushError, type PushSubscription } from 'web-push';
import {
  addSubscription,
  PUSH_SEND_CONCURRENCY,
  PUSH_SEND_TIMEOUT_MS,
  removeSubscription,
  sendToAll,
  subscriptionCount,
} from '../pushStore';

function fakeSub(endpoint: string): PushSubscription {
  return { endpoint, keys: { p256dh: 'p', auth: 'a' } };
}

describe('sendToAll', () => {
  const endpoints: string[] = [];

  function subscribe(count: number): void {
    for (let i = 0; i < count; i++) {
      const endpoint = `https://push.example/send-${endpoints.length}`;
      endpoints.push(endpoint);
      addSubscription(fakeSub(endpoint));
    }
  }

  afterEach(() => {
    endpoints.splice(0).forEach(removeSubscription);
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function configure(): void {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => {});
  }

  it('limita os envios simultâneos e passa o timeout por envio', async () => {
    configure();
    subscribe(PUSH_SEND_CONCURRENCY * 3);
    let inFlight = 0;
    let maxInFlight = 0;
    const send = vi.spyOn(webpush, 'sendNotification').mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { statusCode: 201, body: '', headers: {} };
    });

    const delivered = await sendToAll({ title: 't', body: 'b' });

    expect(delivered).toBe(PUSH_SEND_CONCURRENCY * 3);
    expect(maxInFlight).toBeLessThanOrEqual(PUSH_SEND_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(send.mock.calls[0][2]).toMatchObject({ timeout: PUSH_SEND_TIMEOUT_MS });
  });

  it('envio pendurado expira e não conta como entregue', async () => {
    configure();
    subscribe(2);
    vi.useFakeTimers();
    vi.spyOn(webpush, 'sendNotification')
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const pending = sendToAll({ title: 't', body: 'b' });
    await vi.advanceTimersByTimeAsync(PUSH_SEND_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it('remove inscrições expiradas (410) e mantém as outras', async () => {
    configure();
    subscribe(2);
    const start = subscriptionCount();
    vi.spyOn(webpush, 'sendNotification')
      .mockRejectedValueOnce(new WebPushError('gone', 410, {}, '', endpoints[0]))
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });

    const delivered = await sendToAll({ title: 't', body: 'b' });

    expect(delivered).toBe(1);
    expect(subscriptionCount()).toBe(start - 1);
  });
});
