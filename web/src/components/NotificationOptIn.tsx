'use client';

import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Opt-in de notificações de novos sorteios. Se o navegador não suporta push
 * (ou não há chave VAPID no build), o componente não renderiza nada — nada de
 * botão morto. Permissão negada vira um aviso explicativo, já que o navegador
 * não deixa pedir de novo por código.
 */
export default function NotificationOptIn() {
  const { t } = useTranslation();
  const { supported, permission, subscribed, busy, enable, disable } = usePushNotifications();

  if (!supported) return null;

  if (permission === 'denied') {
    return <Alert severity="info">{t('notifications.denied')}</Alert>;
  }

  if (subscribed) {
    return (
      <Button
        variant="text"
        size="small"
        color="inherit"
        startIcon={busy ? <CircularProgress size={16} aria-hidden /> : <NotificationsOffIcon />}
        onClick={() => void disable()}
        disabled={busy}
        aria-busy={busy}
      >
        {t('notifications.disable')}
      </Button>
    );
  }

  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={busy ? <CircularProgress size={16} aria-hidden /> : <NotificationsActiveIcon />}
      onClick={() => void enable()}
      disabled={busy}
      aria-busy={busy}
    >
      {t('notifications.enable')}
    </Button>
  );
}
