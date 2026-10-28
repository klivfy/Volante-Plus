'use client';

import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';
import Stack from '@mui/material/Stack';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Opt-in de notificações de novos sorteios. Se o navegador não suporta push
 * (ou não há chave VAPID no build), o componente não renderiza nada — nada de
 * botão morto. Permissão negada vira um aviso explicativo, já que o navegador
 * não deixa pedir de novo por código.
 */
export default function NotificationOptIn() {
  const { t } = useTranslation();
  const { supported, permission, subscribed, busy, failed, enable, disable } = usePushNotifications();

  if (!supported) return null;

  if (permission === 'denied') {
    return <Alert severity="info">{t('notifications.denied')}</Alert>;
  }

  const button = subscribed ? (
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
  ) : (
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

  // Falha real (exceção do PushManager/service worker): avisa em vez de deixar
  // o clique morrer sem feedback. O botão continua, para o usuário tentar de novo.
  if (failed) {
    return (
      <Stack spacing={1} sx={{ alignItems: 'flex-end' }}>
        <Alert severity="error" sx={{ py: 0.5 }}>
          {t('notifications.error')}
        </Alert>
        {button}
      </Stack>
    );
  }

  return button;
}
