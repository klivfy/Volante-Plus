import * as Sentry from '@sentry/nextjs';

/**
 * Instrumentação do Next.js (estável no Next 15+). O SDK carrega a config do
 * servidor/edge por aqui; no cliente, `instrumentation-client.ts` é
 * auto-descoberto pelo @sentry/nextjs v10.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
