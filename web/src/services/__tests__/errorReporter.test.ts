import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * O wrapper de telemetria é o único ponto por onde erros do app chegam ao
 * Sentry — inclusive os capturados pelo ErrorBoundary (componentDidCatch).
 * Testar o contrato aqui protege o comportamento de degradação: sem DSN,
 * nada pode lançar nem engolir silenciosamente o diagnóstico de console.
 *
 * Onda 2 (PERF): o SDK passou a ser carregado por `import()` sob demanda —
 * as chamadas ao Sentry são agora assíncronas (microtask), por isso os
 * testes esperam com `vi.waitFor`. O buffer de breadcrumbs (entradas
 * anteriores à carga do SDK, anexadas à primeira captura) também é coberto.
 */

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentry);

import {
  addBreadcrumb,
  captureMessage,
  reportApiError,
  reportDbError,
  reportError,
  reportUserError,
  reportWorkerError,
} from '../errorReporter';

const DSN = 'https://public@sentry.example.com/1';

describe('errorReporter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('reportError', () => {
    it('captura exceção com nível e contexto quando há DSN', async () => {
      const error = new Error('boom');
      reportError(error, 'warning', {
        tags: { lottery: 'MEGA_SENA' },
        extras: { draw: 2900 },
      });

      await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledOnce());
      const [captured, hint] = sentry.captureException.mock.calls[0];
      expect(captured).toBe(error);
      expect(hint.level).toBe('warning');
      expect(hint.tags).toEqual({ lottery: 'MEGA_SENA' });
      expect(hint.contexts).toEqual({ custom: { draw: 2900 } });
    });

    it('converte string em Error antes de capturar', async () => {
      reportError('falha textual');

      await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledOnce());
      const [captured] = sentry.captureException.mock.calls[0];
      expect(captured).toBeInstanceOf(Error);
      expect((captured as Error).message).toBe('falha textual');
    });

    it('sem DSN degrada para console.error e não toca no Sentry', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('sem dsn');
      expect(() => reportError(error)).not.toThrow();

      expect(consoleError).toHaveBeenCalledWith(error);
      expect(sentry.captureException).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('extras undefined não cria bloco contexts vazio', async () => {
      reportError(new Error('x'), 'info', { extras: undefined });
      await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledOnce());
      expect(sentry.captureException.mock.calls[0][1].contexts).toBeUndefined();
    });
  });

  describe('buffer de breadcrumbs (SDK assíncrono)', () => {
    it('anexa breadcrumbs anteriores à captura, na ordem registrada', async () => {
      addBreadcrumb('passo-1', { n: 1 });
      addBreadcrumb('passo-2', undefined, 'warning');
      reportError(new Error('boom'));

      await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledOnce());
      expect(sentry.addBreadcrumb).toHaveBeenNthCalledWith(1, {
        message: 'passo-1',
        data: { n: 1 },
        level: 'info',
      });
      expect(sentry.addBreadcrumb).toHaveBeenNthCalledWith(2, {
        message: 'passo-2',
        data: undefined,
        level: 'warning',
      });
    });

    it('tem teto de 40 entradas (descarta as mais antigas)', async () => {
      for (let i = 1; i <= 45; i += 1) {
        addBreadcrumb(`passo-${i}`);
      }

      await vi.waitFor(() => expect(sentry.addBreadcrumb).toHaveBeenCalled());
      // O flush é síncrono e drena o buffer inteiro numa única passagem.
      expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(40);
      expect(sentry.addBreadcrumb.mock.calls[0][0].message).toBe('passo-6');
      expect(sentry.addBreadcrumb.mock.calls[39][0].message).toBe('passo-45');
    });
  });

  describe('reportApiError', () => {
    it('status >= 500 vira error, abaixo vira warning, com tags de rota', async () => {
      reportApiError(new Error('down'), 503, { endpoint: '/api/push/subscribe', method: 'POST' });
      await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledOnce());
      const [, hintError] = sentry.captureException.mock.calls[0];
      expect(hintError.level).toBe('error');
      expect(hintError.tags).toMatchObject({
        context: 'api',
        status: '503',
        endpoint: '/api/push/subscribe',
        method: 'POST',
      });

      sentry.captureException.mockClear();
      reportApiError(new Error('bad request'), 400);
      await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledOnce());
      const [, hintWarning] = sentry.captureException.mock.calls[0];
      expect(hintWarning.level).toBe('warning');
      expect(hintWarning.tags).toMatchObject({ status: '400', endpoint: 'unknown' });
    });
  });

  describe('reportDbError e reportWorkerError', () => {
    it('rotulam a origem do erro para filtragem no Sentry', async () => {
      reportDbError(new Error('idb'), { operation: 'load', table: 'draws' });
      reportWorkerError(new Error('worker'), { workerType: 'backtest', messageType: 'result' });
      reportUserError(new Error('user'));

      await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(3));
      expect(sentry.captureException.mock.calls[0][1].tags).toEqual({
        context: 'database',
        operation: 'load',
        table: 'draws',
      });
      expect(sentry.captureException.mock.calls[1][1].tags).toEqual({
        context: 'worker',
        workerType: 'backtest',
        messageType: 'result',
      });
      expect(sentry.captureException.mock.calls[2][1].level).toBe('warning');
      expect(sentry.captureException.mock.calls[2][1].tags).toMatchObject({ context: 'user-action' });
    });
  });

  describe('captureMessage', () => {
    it('com DSN delega ao Sentry', async () => {
      captureMessage('informação', 'warning');
      await vi.waitFor(() =>
        expect(sentry.captureMessage).toHaveBeenCalledWith('informação', 'warning'),
      );
    });

    it('sem DSN imprime no console e não toca no Sentry', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      captureMessage('informação');

      expect(consoleLog).toHaveBeenCalledWith('informação');
      expect(sentry.captureMessage).not.toHaveBeenCalled();
      consoleLog.mockRestore();
    });
  });

  describe('addBreadcrumb', () => {
    it('com DSN repassa mensagem, dados e nível (após a carga do SDK)', async () => {
      addBreadcrumb('passo', { lottery: 'QUINA' }, 'warning');
      await vi.waitFor(() =>
        expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
          message: 'passo',
          data: { lottery: 'QUINA' },
          level: 'warning',
        }),
      );
    });

    it('sem DSN é no-op seguro', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
      expect(() => addBreadcrumb('passo')).not.toThrow();
      expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    });
  });
});
