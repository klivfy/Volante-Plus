/**
 * Init efetivo do Sentry no cliente — carregado só quando há DSN configurado
 * e depois da primeira pintura (ver `instrumentation-client.ts`). Separado do
 * `sentry.config.ts` para que o `import * as Sentry` — e todo o peso do SDK —
 * fique num chunk dinâmico, fora do JS inicial da página.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryConfig } from '../sentry.config';

Sentry.init(sentryConfig);
