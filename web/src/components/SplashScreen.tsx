'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

const SPLASH_DURATION_MS = 300;
const SPLASH_FADE_MS = 200;
const SPLASH_SHOWN_KEY = 'volante_splash_shown';

export interface SplashScreenProps {
  onComplete?: () => void;
}

/**
 * Tela de boas-vindas (splash) que aparece por 0,3 s no primeiro
 * carregamento. Usa localStorage para não mostrar em recarregamentos
 * subsequentes da mesma sessão.
 *
 * PERF (docs/PROPOSTAS-PERF-A11Y.md, P8): eram 0,7 s — e o LCP da primeira
 * visita era a legenda do splash, não o conteúdo da página. 0,3 s mantém o
 * momento de marca sem empurrar o LCP real para fora da janela de carga.
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
    // Sem splash quando a sessão já o mostrou ou quando o sistema pede menos
    // movimento: o app deve abrir na hora, não fazer o usuário esperar.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduceMotion || sessionStorage.getItem(SPLASH_SHOWN_KEY)) {
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
        background: `linear-gradient(135deg, ${theme.vars?.palette.primary.main ?? theme.palette.primary.main} 0%, ${theme.vars?.palette.primary.dark ?? theme.palette.primary.dark} 100%)`,
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
        {/*
          `component="p"` mantém a escala tipográfica h3 e remove a semântica
          de cabeçalho. Este texto é a marca dentro de uma sobreposição de
          carregamento, não um título do documento: como <h3> ele duplicava o
          nome acessível do <h1> da página (que fica montada por baixo durante
          os 0,3 s do splash) e ainda punha um h3 antes do h1 na ordem de
          cabeçalhos, que é justamente o que leitores de tela usam para
          navegar.
        */}
        <Typography
          variant="h3"
          component="p"
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
          // Decorativo: a marca e o texto já comunicam o carregamento; um
          // progressbar sem nome acessível é só ruído (e reprova no axe).
          aria-hidden
          sx={{
            color: 'inherit',
            marginTop: 2,
          }}
        />
      </Stack>
    </Box>
  );
}
