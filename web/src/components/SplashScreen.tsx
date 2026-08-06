'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

const SPLASH_DURATION_MS = 2500;
const SPLASH_FADE_MS = 300;
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
  const [sessionChecked, setSessionChecked] = useState(false);
  // `primary` já é a cor da modalidade selecionada (verde na Mega-Sena, azul na
  // +Milionária) porque o provider de tema é dinâmico — ver `LotteryThemeContext`.
  const theme = useTheme();

  // Ajuste durante a renderização, não em efeito (mesmo padrão de `page.tsx`):
  // decidir em efeito faria o splash aparecer por um frame antes de sumir em
  // toda navegação subsequente da sessão. `typeof window` guarda o SSR.
  if (!sessionChecked && typeof window !== 'undefined') {
    setSessionChecked(true);
    if (sessionStorage.getItem(SPLASH_SHOWN_KEY)) {
      setVisible(false);
    } else {
      sessionStorage.setItem(SPLASH_SHOWN_KEY, 'true');
    }
  }

  useEffect(() => {
    if (!visible) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [visible, onComplete]);

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
        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        zIndex: 9999,
        animation: `fadeOut ${SPLASH_FADE_MS}ms ease-in-out forwards`,
        animationDelay: `${SPLASH_DURATION_MS - SPLASH_FADE_MS}ms`,
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
          color: 'primary.contrastText',
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.5px',
          }}
        >
          Volante+
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontWeight: 400,
            letterSpacing: '0.3px',
            opacity: 0.85,
          }}
        >
          Laboratório Estatístico
        </Typography>
        <CircularProgress
          sx={{
            color: 'inherit',
            marginTop: 2,
          }}
        />
      </Stack>
    </Box>
  );
}
