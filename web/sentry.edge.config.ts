/**
 * Sentry no runtime Edge, carregado por `src/instrumentation.ts` quando
 * `NEXT_RUNTIME === 'edge'` — convenção Next 15+/Turbopack.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryConfig } from './sentry.config';

Sentry.init(sentryConfig);
