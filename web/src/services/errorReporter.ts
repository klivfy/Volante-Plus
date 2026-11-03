/**
 * Sentry error reporting wrapper.
 * Provides centralized error capturing with severity levels and context.
 *
 * PERF (medido no Lighthouse, docs/PROPOSTAS-PERF-A11Y.md, onda 2): este
 * módulo é importado estaticamente pela home e pelo backtesting, então o
 * `import * as Sentry` daqui mantinha o SDK inteiro no grafo de módulos da
 * página — o JS do Sentry (SDK core + Replay, ~650 KB entre chunks) era
 * empacotado e pré-cacheado mesmo com DSN vazio, quando nada é enviado.
 * O SDK agora só entra em cena via `import()` sob demanda:
 *
 * - Sem DSN (build atual): todo acesso degrada para `console`; o ramo do
 *   `import()` é eliminado na compilação — nenhum byte do Sentry chega ao
 *   browser nem ao precache do service worker.
 * - Com DSN: o SDK vira chunk async, baixado no primeiro erro/breadcrumb. No
 *   browser a carga encadeia `sentry-client-init` (mesmo módulo que
 *   `instrumentation-client.ts` agenda no idle — import deduplicado pelo
 *   bundler, init roda uma única vez), para que uma captura anterior ao
 *   `requestIdleCallback` encontre um client configurado em vez de ser
 *   descartada por falta de init.
 *
 * Trade-off aceito (na linha da onda 1): a captura deixou de ser síncrona —
 * entre o erro e a carga do SDK há uma microtask. Se a aba fechar nesse
 * intervalo, o evento se perde. O buffer de breadcrumbs abaixo compensa o
 * caso que antes já se perdia de qualquer forma: breadcrumbs anteriores ao
 * `Sentry.init` não eram retidos pelo SDK.
 */

export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export type ContextValue = string | number | boolean | undefined;

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  tags?: Record<string, string>;
  extras?: Record<string, ContextValue>;
}

type SentryModule = typeof import('@sentry/nextjs');

/** Promise única do SDK: o `import()` já é deduplicado pelo bundler e aqui
 * memoizamos o encadeamento com o init do browser. */
let sentryPromise: Promise<SentryModule> | null = null;

function loadSentry(): Promise<SentryModule> {
  // Todo acesso ao SDK fica DENTRO do ramo do DSN: com DSN vazio no build,
  // o DefinePlugin torna a condição constante e o ConstPlugin do webpack
  // poda o ramo antes de analisar dependências — o `import()` não gera
  // chunk e o precache do PWA deixa de baixar ~650 KB de código que nunca
  // roda. Em runtime (testes), a leitura da env respeita o stub; os callers
  // já verificaram o DSN antes de chegar aqui.
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    sentryPromise ??= Promise.all([
      import('@sentry/nextjs'),
      // No browser, garante o init antes da primeira captura. É o mesmo
      // módulo que `instrumentation-client.ts` agenda no idle — quem chegar
      // primeiro carrega, o bundler deduplica e o init roda uma única vez.
      typeof window !== 'undefined' ? import('../sentry-client-init') : Promise.resolve(),
    ]).then(([sentryModule]) => sentryModule);
    return sentryPromise;
  }
  return Promise.reject(new Error('Sentry desabilitado (sem DSN)'));
}

/**
 * Breadcrumbs anteriores à carga do SDK ficam neste buffer síncrono e são
 * anexados à primeira captura (ou ao primeiro breadcrumb pós-carga). Sem
 * isso, tudo que acontece antes do `Sentry.init` — no cliente, até o
 * `requestIdleCallback` — nunca chegaria ao Sentry.
 */
interface PendingBreadcrumb {
  message: string;
  data?: Record<string, string | number | boolean | undefined>;
  level: 'info' | 'warning' | 'error';
}

/** Mesmo teto de `maxBreadcrumbs` do `sentry.config.ts` (50), com folga. */
const BREADCRUMB_BUFFER_LIMIT = 40;
const breadcrumbBuffer: PendingBreadcrumb[] = [];

function recordBreadcrumb(breadcrumb: PendingBreadcrumb): void {
  breadcrumbBuffer.push(breadcrumb);
  if (breadcrumbBuffer.length > BREADCRUMB_BUFFER_LIMIT) {
    breadcrumbBuffer.shift();
  }
}

function flushBreadcrumbs(sentryModule: SentryModule): void {
  let pending = breadcrumbBuffer.shift();
  while (pending) {
    sentryModule.addBreadcrumb({ message: pending.message, data: pending.data, level: pending.level });
    pending = breadcrumbBuffer.shift();
  }
}

/**
 * Report an error to Sentry with context and severity.
 * A inicialização do Sentry NÃO acontece aqui: sem DSN (ou no servidor/edge),
 * quem inicia é `instrumentation.ts` + `instrumentation-client.ts` (convenção
 * do Next 15+/Turbopack). Este módulo só captura — e degrada para
 * `console.error` quando não há DSN configurado.
 */
export function reportError(
  error: Error | string,
  severity: ErrorSeverity = 'error',
  context?: ErrorContext,
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.error(error);
    return;
  }

  const errorObj = typeof error === 'string' ? new Error(error) : error;

  void loadSentry().then((Sentry) => {
    flushBreadcrumbs(Sentry);
    Sentry.captureException(errorObj, {
      level: severity,
      tags: context?.tags,
      contexts: context?.extras
        ? {
            custom: context.extras,
          }
        : undefined,
    });
  });
}

/**
 * Report an error from API route.
 * Captures status code and request details.
 */
export function reportApiError(
  error: Error | string,
  status: number,
  context?: Omit<ErrorContext, 'extras'> & {
    endpoint?: string;
    method?: string;
  },
): void {
  const severity = status >= 500 ? 'error' : 'warning';

  reportError(error, severity, {
    ...context,
    tags: {
      context: 'api',
      status: status.toString(),
      endpoint: context?.endpoint || 'unknown',
      method: context?.method || 'unknown',
      ...context?.tags,
    },
  });
}

/**
 * Report an IndexedDB error.
 * Captures operation type and database state.
 */
export function reportDbError(
  error: Error | string,
  context?: Omit<ErrorContext, 'extras'> & {
    operation?: string;
    table?: string;
  },
): void {
  reportError(error, 'error', {
    ...context,
    tags: {
      context: 'database',
      operation: context?.operation || 'unknown',
      table: context?.table || 'unknown',
    },
  });
}

/**
 * Report a Web Worker error.
 * Captures worker context and message exchange.
 */
export function reportWorkerError(
  error: Error | string,
  context?: Omit<ErrorContext, 'extras'> & {
    workerType?: string;
    messageType?: string;
  },
): void {
  reportError(error, 'error', {
    ...context,
    tags: {
      context: 'worker',
      workerType: context?.workerType || 'unknown',
      messageType: context?.messageType || 'unknown',
    },
  });
}

/**
 * Report a user action error (non-critical).
 * For expected errors like validation or permission denied.
 */
export function reportUserError(
  error: Error | string,
  context?: ErrorContext,
): void {
  reportError(error, 'warning', {
    ...context,
    tags: {
      context: 'user-action',
      ...context?.tags,
    },
  });
}

/**
 * Capture a message (non-error).
 * Useful for breadcrumbs or informational logging.
 */
export function captureMessage(
  message: string,
  severity: 'error' | 'warning' | 'info' = 'info',
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.log(message);
    return;
  }

  void loadSentry().then((Sentry) => {
    flushBreadcrumbs(Sentry);
    Sentry.captureMessage(message, severity);
  });
}

/**
 * Add breadcrumb for debugging.
 * Appears in Sentry error context trail.
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, string | number | boolean | undefined>,
  level: 'info' | 'warning' | 'error' = 'info',
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }

  recordBreadcrumb({ message, data, level });
  void loadSentry().then(flushBreadcrumbs);
}
