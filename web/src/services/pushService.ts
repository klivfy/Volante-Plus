'use client';

/**
 * Push API no cliente: pede permissão, inscreve o usuário no `PushManager` do
 * service worker e envia a inscrição ao backend (`/api/push/subscribe`). Quando
 * o app está aberto, `showLocalNotification` cobre o caso em que não vale a pena
 * um push do servidor — basta uma notificação local imediata.
 *
 * Tudo é best-effort e degrada com elegância: navegadores sem `Notification`,
 * `PushManager` ou service worker simplesmente reportam "não suportado", sem
 * lançar.
 */

/** Chave pública VAPID, exposta ao cliente em tempo de build. */
export function getVapidPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined;
}

/** `true` quando o navegador tem os três pilares de push web (SW + Push + Notification). */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Estado atual da permissão de notificação, ou `'unsupported'` se o navegador não tem a API. */
export function getPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * Chave VAPID base64url → `Uint8Array`, formato exigido por
 * `pushManager.subscribe({ applicationServerKey })`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Pede permissão de notificação ao usuário. Idempotente: já concedida/negada retorna direto. */
export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Inscreve o usuário no push e registra a inscrição no backend. Retorna a
 * `PushSubscription` em caso de sucesso, ou `null` se não houver suporte,
 * permissão ou chave VAPID configurada.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const vapidKey = getVapidPublicKey();
  if (!vapidKey) return null;

  const permission = await requestPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: nossa Uint8Array é um BufferSource válido; o alargamento vem só do
      // `ArrayBufferLike` genérico do lib alvo, não de um SharedArrayBuffer real.
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    }));

  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
  } catch {
    // Backend indisponível (ex.: rodando sem servidor de push) — a inscrição
    // local ainda vale para notificações locais; não é um erro fatal.
  }

  return subscription;
}

/**
 * Reenvia a inscrição de push existente ao backend, sem pedir permissão nem
 * criar inscrição nova — idempotente.
 *
 * WHY: o store de inscrições vive na memória do processo serverless e não
 * sobrevive a cold starts. A inscrição do navegador continua válida no
 * serviço de push do navegador, mas ninguém a dispararia — reenviá-la no
 * startup do app recupera o par navegador/backend automaticamente.
 */
export async function repostSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
  } catch {
    // Best-effort: ver subscribeToPush — sem backend de push, a inscrição
    // local continua válida para notificações locais.
  }
}

/** Cancela a inscrição de push, se houver. Retorna `true` se algo foi cancelado. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  try {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { auth: subscription.toJSON().keys?.auth },
      }),
    });
  } catch {
    // Ver subscribeToPush: falha ao avisar o backend não impede o cancelamento local.
  }

  return subscription.unsubscribe();
}

/** `true` se já existe uma inscrição de push ativa neste navegador. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}

/**
 * Fallback com app aberto: mostra uma notificação local imediata (via service
 * worker, para ganhar `notificationclick`), sem depender do servidor de push.
 */
export async function showLocalNotification(title: string, body: string): Promise<void> {
  if (getPermission() !== 'granted') return;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
    });
    return;
  }
  new Notification(title, { body, icon: '/icon-192x192.png' });
}
