'use client';

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from './ErrorBoundary';

/** Instancia o `ErrorBoundary` já com os textos traduzidos — só existe porque `layout.tsx` é um Server Component e `useTranslation` exige um componente cliente. */
export default function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <ErrorBoundary title={t('errorBoundary.title')} body={t('errorBoundary.body')} retryLabel={t('errorBoundary.retry')}>
      {children}
    </ErrorBoundary>
  );
}
