/**
 * Sentry client-side configuration.
 * Auto-loaded by @sentry/nextjs when NEXT_PUBLIC_SENTRY_DSN is set.
 */

import * as Sentry from '@sentry/nextjs';

export const sentryConfig = {
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Ambiente de deployment
  environment: process.env.NODE_ENV || 'development',

  // Release version — use como Git commit hash ou semver
  release: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',

  // Amostragem: % de transações a rastrear (0-1)
  // 1.0 = 100%, 0.1 = 10% (para reduzir quota em produção)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Amostragem de capturas de erro (0-1)
  // 1.0 = todos os erros, 0.1 = 10% aleatório
  sampleRate: process.env.NODE_ENV === 'production' ? 0.9 : 1.0,

  // Evitar capturar erros de partes do app que não são críticas
  ignoreErrors: [
    // Browser extensions e scripts injected
    /top\.GLOBALS/,
    // Plugin do browser
    /plugin/i,
    // Erros de rede esperados
    /Failed to fetch/,
    /NetworkError/,
  ],

  // Dados sensíveis a não capturar
  beforeSend(event: Sentry.Event) {
    if (!event.request) return event;

    // Não capturar credenciais
    if (event.request.headers?.authorization) {
      delete event.request.headers.authorization;
    }

    return event;
  },

  // Breadcrumbs: rastreamento de ações antes do erro
  maxBreadcrumbs: 50,

  // Não publicar source maps em produção (mant-los locais)
  // Usar SENTRY_AUTH_TOKEN para upload ao Sentry durante build
  denyUrls: [
    // Ignorar erros de browsers/extensions
    /extension\//i,
    /moz-extension\//i,
    /chrome-extension\//i,
  ],
};

export default sentryConfig;
