import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';
import { MAX_SUBSCRIPTIONS } from '@/server/pushStore';

/**
 * A rota de inscrição exige chaves VAPID reais (o `web-push` valida o par
 * antes de `setVapidDetails`), então os testes de caminho feliz geram um par
 * com `web-push.generateVAPIDKeys()`.
 */

const validSubscription = () => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-1',
  keys: {
    p256dh: 'BCompactP256dhKeyFixture_0123456789abcdef',
    auth: 'authSecret_0123456789',
  },
});

describe('POST /api/push/subscribe', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('responde 503 quando o servidor não tem chaves VAPID', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const response = await POST(
      new Request('http://localhost/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(validSubscription()),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/VAPID/i);
  });

  it('registra uma inscrição válida com VAPID configurado', async () => {
    const { generateVAPIDKeys } = await import('web-push');
    const keys = generateVAPIDKeys();
    vi.stubEnv('VAPID_PUBLIC_KEY', keys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);

    const response = await POST(
      new Request('http://localhost/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(validSubscription()),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { count?: number };
    expect(body.count).toBeGreaterThan(0);
  });

  it('rejeita endpoint fora dos hosts de push de navegador', async () => {
    const { generateVAPIDKeys } = await import('web-push');
    const keys = generateVAPIDKeys();
    vi.stubEnv('VAPID_PUBLIC_KEY', keys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);

    const response = await POST(
      new Request('http://localhost/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          ...validSubscription(),
          endpoint: 'https://atacante.example.com/proxy',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('recusa novas inscrições quando o teto do store foi atingido', async () => {
    const { generateVAPIDKeys } = await import('web-push');
    const keys = generateVAPIDKeys();
    vi.stubEnv('VAPID_PUBLIC_KEY', keys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);

    const pushStore = await import('@/server/pushStore');
    vi.spyOn(pushStore, 'addSubscription').mockImplementation(() => false);

    const response = await POST(
      new Request('http://localhost/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(validSubscription()),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
    expect(MAX_SUBSCRIPTIONS).toBeGreaterThan(0);
  });
});
