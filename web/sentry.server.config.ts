/**
 * Sentry server-side (runtime Node), carregado por `src/instrumentation.ts`
 * quando `NEXT_RUNTIME === 'nodejs'` — convenção Next 15+/Turbopack; o formato
 * antigo de client config em `next.config.js` não é mais lido.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryConfig } from './sentry.config';

Sentry.init(sentryConfig);
