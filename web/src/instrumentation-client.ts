import * as Sentry from '@sentry/nextjs';
import { sentryConfig } from '../sentry.config';

/**
 * Instrumentação do cliente (browser). O arquivo `instrumentation-client.ts`
 * é a convenção do Next 15+/Turbopack — o client config antigo em
 * `next.config.js` nunca é lido, o que deixava o Sentry do browser desligado.
 */
Sentry.init(sentryConfig);
