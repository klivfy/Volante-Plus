'use client';

import { ReactNode, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { createLotteryTheme } from '@/theme';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import PwaLifecycle from '@/components/PwaLifecycle';
import { LotteryThemeProvider, useLotteryTheme } from '@/context/LotteryThemeContext';

/**
 * Aplica o tema da modalidade selecionada. Claro/escuro NÃO é decidido aqui: as
 * duas paletas vão no stylesheet (variáveis CSS) e o navegador escolhe por
 * `prefers-color-scheme`. Trocar de tema em JavaScript depois da hidratação
 * deixava os cartões claros na primeira carga em modo escuro (ver `theme.ts`).
 */
function DynamicThemeProvider({ children }: { children: ReactNode }) {
  const { lottery } = useLotteryTheme();
  const theme = useMemo(() => createLotteryTheme(lottery), [lottery]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PwaLifecycle />
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </ThemeProvider>
  );
}

/**
 * Providers globais.
 *
 * `AppRouterCacheProvider` é obrigatório com o App Router: sem ele, o
 * Emotion injeta as folhas de estilo do `CssBaseline` de um jeito no
 * servidor e de outro no cliente, e a hidratação diverge logo na primeira
 * tag `<style>`.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <AppRouterCacheProvider>
        <LotteryThemeProvider>
          <DynamicThemeProvider>{children}</DynamicThemeProvider>
        </LotteryThemeProvider>
      </AppRouterCacheProvider>
    </I18nextProvider>
  );
}
