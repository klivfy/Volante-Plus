'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { darkTheme, lightTheme } from '@/theme';

/**
 * Aplica o tema Material 3 seguindo a preferência do sistema.
 *
 * `noSsr` evita o flash claro→escuro: sem ele a primeira renderização assume
 * o tema claro no servidor e só troca depois de hidratar no cliente.
 */
export default function Providers({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });

  return (
    <ThemeProvider theme={prefersDark ? darkTheme : lightTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
