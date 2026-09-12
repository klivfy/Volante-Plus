'use client';

import { ReactNode, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { createLotteryDarkTheme, createLotteryLightTheme } from '@/theme';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import PwaLifecycle from '@/components/PwaLifecycle';
import { LotteryThemeProvider, useLotteryTheme } from '@/context/LotteryThemeContext';

/**
 * Componente interno que aplica o tema dinamicamente baseado na modalidade.
 * Acessa o contexto LotteryTheme para determinar a cor primária.
 */
function DynamicThemeProvider({ children }: { children: ReactNode }) {
  const { lottery } = useLotteryTheme();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });

  const theme = useMemo(() => {
    const theme = prefersDark
      ? createLotteryDarkTheme(lottery)
      : createLotteryLightTheme(lottery);
    return theme;
  }, [lottery, prefersDark]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PwaLifecycle />
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </ThemeProvider>
  );
}

/**
 * Aplica o tema Material 3 seguindo a preferência do sistema e a modalidade selecionada.
 *
 * `AppRouterCacheProvider` é obrigatório com o App Router: sem ele, o
 * Emotion injeta as folhas de estilo do `CssBaseline` de um jeito no
 * servidor e de outro no cliente, e a hidratação diverge logo na primeira
 * tag `<style>`. `noSsr` no `useMediaQuery` evita o flash claro→escuro: sem
 * ele a primeira renderização assume o tema claro no servidor e só troca
 * depois de hidratar no cliente.
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
