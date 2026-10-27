import * as Sentry from '@sentry/nextjs';

/**
 * Hook de instrumentação do Next (App Router). `register` roda uma vez por
 * processo; o branch por `NEXT_RUNTIME` carrega a config certa para cada
 * runtime (Node serverless / Edge).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
