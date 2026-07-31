'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPermission,
  getVapidPublicKey,
  isPushSupported,
  isSubscribed as isSubscribedNow,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushService';

export interface UsePushNotificationsResult {
  /** `false` quando o navegador não tem push/notification, ou não há chave VAPID configurada. */
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  busy: boolean;
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

  useEffect(() => {
    if (!supported) return;
    let active = true;
    // setState dentro de callback assíncrono (não no corpo síncrono do efeito) —
    // evita o cascading render que o `react-hooks/set-state-in-effect` flagra.
    void (async () => {
      const subscribed = await isSubscribedNow();
      if (!active) return;
      setPermission(getPermission());
      setSubscribed(subscribed);
    })();
    return () => {
      active = false;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const subscription = await subscribeToPush();
      setSubscribed(subscription !== null);
      setPermission(getPermission());
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  const disable = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  return { supported, permission, subscribed, busy, enable, disable };
}
