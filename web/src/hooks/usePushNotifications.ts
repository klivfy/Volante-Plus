'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPermission,
  getVapidPublicKey,
  isPushSupported,
  isSubscribed as isSubscribedNow,
  repostSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushService';
import { reportUserError } from '../services/errorReporter';

export interface UsePushNotificationsResult {
  /** `false` quando o navegador não tem push/notification, ou não há chave VAPID configurada. */
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  busy: boolean;
  /** `true` quando a última tentativa de ativar/desativar falhou de fato (exceção, não permissão negada). */
  failed: boolean;
  /** Pede permissão e inscreve; no-op se já inscrito ou sem suporte. */
  enable: () => Promise<void>;
  /** Cancela a inscrição de push. */
  disable: () => Promise<void>;
}

/**
 * Estado de opt-in de notificações push para a UI. Sem suporte real (ou sem
 * chave VAPID de build), reporta `supported: false` para a UI se esconder, em
 * vez de mostrar um botão que não faria nada.
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const supported = isPushSupported() && getVapidPublicKey() !== undefined;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    // setState dentro de callback assíncrono (não no corpo síncrono do efeito) —
    // evita o cascading render que o `react-hooks/set-state-in-effect` flagra.
    void (async () => {
      try {
        // Cold start do backend esvaziou o store? Reenvia a inscrição que o
        // navegador já tem — idempotente, sem pedir permissão de novo.
        await repostSubscription();
        const subscribed = await isSubscribedNow();
        if (!active) return;
        setPermission(getPermission());
        setSubscribed(subscribed);
      } catch {
        // Best-effort em background (`serviceWorker.ready` rejeita, p. ex.,
        // quando não há worker ativo): o opt-in explícito segue disponível.
      }
    })();
    return () => {
      active = false;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const subscription = await subscribeToPush();
      setSubscribed(subscription !== null);
      setPermission(getPermission());
    } catch (err) {
      // `pushManager.subscribe` lança (NotAllowedError, chave inválida, worker
      // sumido): sem isto, a rejeição vira unhandled rejection e o usuário
      // clica sem qualquer feedback.
      reportUserError(err instanceof Error ? err : new Error('Push subscribe failed'), {
        tags: { context: 'push-opt-in', operation: 'subscribe' },
      });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  const disable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (err) {
      reportUserError(err instanceof Error ? err : new Error('Push unsubscribe failed'), {
        tags: { context: 'push-opt-in', operation: 'unsubscribe' },
      });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  return { supported, permission, subscribed, busy, failed, enable, disable };
}
