import * as Sentry from '@sentry/nextjs';

/**
 * Inicialização do Sentry no runtime Node.js (rotas de API, server
 * components). Importado por `instrumentation.ts` — ver a nota em
 * `instrumentation-client.ts` sobre a convenção de arquivos do SDK v10.
 */
Sentry.init({
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV || 'development',

  release: process.env.NEXT_PUBLIC_APP_VERSION || '2.3.0',

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
