'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const SPLASH_DURATION_MS = 2500;
const SPLASH_SHOWN_KEY = 'volante_splash_shown';

export interface SplashScreenProps {
  onComplete?: () => void;
}

/**
 * Tela de boas-vindas (splash) que aparece por 2.5 segundos no primeiro
 * carregamento. Usa localStorage para não mostrar em recarregamentos
 * subsequentes da mesma sessão.
 */
export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Verificar se o splash já foi mostrado nesta sessão
    const splashShown = sessionStorage.getItem(SPLASH_SHOWN_KEY);
    if (splashShown) {
      setVisible(false);
      onComplete?.();
      return;
    }

    // Marcar que o splash foi mostrado
    sessionStorage.setItem(SPLASH_SHOWN_KEY, 'true');

    // Timer para esconder o splash após SPLASH_DURATION_MS
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #6750A4 0%, #4F378B 100%)',
        zIndex: 9999,
        animation: 'fadeOut 0.5s ease-in-out forwards',
        animationDelay: `${SPLASH_DURATION_MS - 500}ms`,
        '@keyframes fadeOut': {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
      }}
    >
      <Stack
        spacing={3}
        sx={{
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: '#FFFBFE',
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            color: '#FFFBFE',
            letterSpacing: '0.5px',
          }}
        >
          Volante+
        </Typography>
        <Typography
          variant="body1"
          sx={{
            color: '#E8DEF8',
            fontWeight: 400,
            letterSpacing: '0.3px',
          }}
        >
          Laboratório Estatístico
        </Typography>
        <CircularProgress
          sx={{
            color: '#EADDFF',
            marginTop: 2,
          }}
        />
      </Stack>
    </Box>
  );
}
