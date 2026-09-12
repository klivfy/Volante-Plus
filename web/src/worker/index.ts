/**
 * Worker customizado do `@ducanh2912/next-pwa`: seu conteúdo é compilado e
 * importado (`importScripts`) dentro do service worker gerado pelo Workbox
 * (`public/sw.js`). É aqui que ficam os handlers que o Workbox não cobre —
 * `push`, `notificationclick` e `periodicsync` — sem precisar escrever o SW
 * inteiro à mão.
 *
 * Tipagem: o escopo real é um `ServiceWorkerGlobalScope`, mas puxar a lib
 * `webworker` no tsconfig (que é `dom`) conflitaria com os tipos de `self`/DOM
 * do resto do app. Por isso declaramos aqui só a fatia da API que usamos.
 */

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface PushEventLike extends ExtendableEventLike {
  data: { json(): unknown; text(): string } | null;
}

interface NotificationClickEventLike extends ExtendableEventLike {
  notification: { close(): void; data?: { url?: string } };
}

interface PeriodicSyncEventLike extends ExtendableEventLike {
  tag: string;
}

interface WindowClientLike {
  url: string;
  focus(): Promise<unknown>;
  postMessage(message: unknown): void;
}

interface ServiceWorkerScope {
  registration: {
    scope: string;
    showNotification(title: string, options?: Record<string, unknown>): Promise<void>;
  };
  clients: {
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: 'push', listener: (event: PushEventLike) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: NotificationClickEventLike) => void): void;
  addEventListener(type: 'periodicsync', listener: (event: PeriodicSyncEventLike) => void): void;
}

// `self` no escopo global é tipado como `Window` (lib `dom`); aqui ele é, na
// verdade, o escopo do service worker. Reinterpretamos via a fatia de API que
// declaramos acima, sem puxar a lib `webworker` (que conflitaria com `dom`).
const sw = self as unknown as ServiceWorkerScope;

/** Mesma tag registrada pelo cliente em `services/syncService.ts`. */
const SYNC_TAG = 'volante-plus-sync';

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

function parsePushPayload(event: PushEventLike): PushPayload {
  if (!event.data) return {};
  try {
    return event.data.json() as PushPayload;
  } catch {
    return { body: event.data.text() };
  }
}

// Novo sorteio detectado pelo servidor de push: mostra a notificação. Guarda a
// URL de destino em `data` para o `notificationclick` abrir a tela certa.
sw.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title ?? 'Volante+';
  const body = payload.body ?? 'Novo sorteio disponível.';
  event.waitUntil(
    sw.registration.showNotification(title, {
      body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

/**
 * Resolve o destino do clique **dentro da origem do app**.
 *
 * WHY: `openWindow` abre o que receber, e o valor vem do payload do push —
 * ou seja, de quem conseguir disparar uma notificação. Uma notificação com o
 * nome e o ícone do Volante+ que abre um site de terceiros é phishing com a
 * credibilidade do app emprestada. O servidor já normaliza este campo, mas o
 * service worker é a última fronteira antes da navegação e valida de novo:
 * as duas pontas erradas ao mesmo tempo é o que seria preciso para escapar.
 */
function resolveSameOriginUrl(raw: string | undefined): string {
  const scope = sw.registration.scope;
  if (!raw) return scope;
  try {
    const target = new URL(raw, scope);
    const origin = new URL(scope).origin;
    return target.origin === origin ? target.href : scope;
  } catch {
    return scope;
  }
}

// Clique na notificação: foca uma aba já aberta do app ou abre uma nova.
sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = resolveSameOriginUrl(event.notification.data?.url);
  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(sw.registration.scope)) {
          return client.focus();
        }
      }
      return sw.clients.openWindow(targetUrl);
    }),
  );
});

// Periodic Background Sync: o SW acorda periodicamente e pede às abas abertas
// que sincronizem o histórico (a persistência real usa o IndexedDB via Dexie,
// que vive no contexto da página). Sem aba aberta, o fallback `syncIfStale` ao
// reabrir o app cobre a lacuna.
sw.addEventListener('periodicsync', (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: 'volante-sync' });
      }
    }),
  );
});
