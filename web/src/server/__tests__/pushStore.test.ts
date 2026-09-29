import { describe, expect, it } from 'vitest';
import type { PushSubscription } from 'web-push';
import {
  addSubscription,
  configureWebPush,
  removeSubscription,
  removeSubscriptionIfAuthMatches,
  sendToAll,
  subscriptionCount,
} from '../pushStore';

function fakeSub(endpoint: string): PushSubscription {
  return { endpoint, keys: { p256dh: 'p', auth: 'a' } };
}

describe('pushStore', () => {
  it('só remove por auth quando o segredo da inscrição confere', () => {
    const start = subscriptionCount();
    addSubscription(fakeSub('https://push.example/c'));
    expect(removeSubscriptionIfAuthMatches('https://push.example/c', 'errado')).toBe(false);
    expect(subscriptionCount()).toBe(start + 1);
    expect(removeSubscriptionIfAuthMatches('https://push.example/c', 'a')).toBe(true);
    expect(subscriptionCount()).toBe(start);
  });

  it('add/remove refletem na contagem, sem duplicar por endpoint', () => {
    const start = subscriptionCount();

    addSubscription(fakeSub('https://push.example/a'));
    addSubscription(fakeSub('https://push.example/a')); // mesmo endpoint → sem duplicar
    addSubscription(fakeSub('https://push.example/b'));
    expect(subscriptionCount()).toBe(start + 2);

    removeSubscription('https://push.example/a');
    expect(subscriptionCount()).toBe(start + 1);

    removeSubscription('https://push.example/b');
    expect(subscriptionCount()).toBe(start);
  });

  it('configureWebPush é false quando faltam chaves VAPID no ambiente', () => {
    // Nenhuma VAPID_* setada no ambiente de teste.
    expect(configureWebPush()).toBe(false);
  });

  it('sendToAll rejeita quando não há chaves VAPID configuradas', async () => {
    await expect(sendToAll({ title: 'x', body: 'y' })).rejects.toThrow(/VAPID/);
  });
});
