'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clearBadge, setBadge } from '@/services/badge';
import { showLocalNotification } from '@/services/pushService';
import {
  LATEST_CHECK_INTERVAL_MS,
  registerBackgroundSync,
  syncAndCountNew,
  syncIfStale,
} from '@/services/syncService';

/**
 * Cola de ciclo de vida do PWA — sem UI (retorna `null`), só efeitos ao montar:
 *
 * 1. **Sync ao abrir** (`syncIfStale`): fallback para quando o Periodic
 *    Background Sync não rodou (navegador sem suporte, permissão negada, app
 *    fechado por muito tempo).
 * 2. **Registro do background sync** (`registerBackgroundSync`): agenda a
 *    sincronização periódica no ambiente atual (Periodic Background Sync / none).
 * 3. **Mensagens do service worker**: o handler `periodicsync` do SW
 *    (`worker/index.ts`) manda `{ type: 'volante-sync' }`; aqui fazemos a
 *    sincronização de fato e, havendo concursos novos, atualizamos o badge do
 *    ícone e mostramos uma notificação local.
 * 4. **Limpar o badge** quando o usuário volta ao app (já "viu" os novos).
 * 5. **Manter atualizado com o app aberto**: ao voltar à aba e a cada
 *    `LATEST_CHECK_INTERVAL_MS`, confere se saiu concurso novo (uma chamada
 *    barata quando nada mudou). Sorteios saem 2 a 3 vezes por semana; quem
 *    deixa o app aberto não pode ficar com o histórico defasado.
 */
export default function PwaLifecycle() {
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    async function runSync(): Promise<void> {
      const newDraws = await syncAndCountNew();
      if (cancelled || newDraws <= 0) return;
      await setBadge(newDraws);
      await showLocalNotification(
        t('notifications.newDrawTitle'),
        t('notifications.newDrawBody', { count: newDraws }),
      );
    }

    void syncIfStale();
    void registerBackgroundSync();

    function onMessage(event: MessageEvent): void {
      if ((event.data as { type?: string })?.type === 'volante-sync') {
        void runSync();
      }
    }

    function onVisible(): void {
      if (document.visibilityState === 'visible') {
        void clearBadge();
        void syncIfStale();
      }
    }
    const interval = setInterval(() => void syncIfStale(), LATEST_CHECK_INTERVAL_MS);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onMessage);
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
      }
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [t]);

  return null;
}
