/**
 * Sentry error reporting wrapper.
 * Provides centralized error capturing with severity levels and context.
 */

import * as Sentry from '@sentry/nextjs';

export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export type ContextValue = string | number | boolean | undefined;

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  tags?: Record<string, string>;
  extras?: Record<string, ContextValue>;
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

  Sentry.captureException(errorObj, {
    level: severity,
    tags: context?.tags,
    contexts: context?.extras
      ? {
          custom: context.extras,
        }
      : undefined,
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
      ...context?.tags,
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
      ...context?.tags,
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

  Sentry.captureMessage(message, severity);
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

  Sentry.addBreadcrumb({
    message,
    data,
    level,
  });
}
