/**
 * Portão de consentimento para o monitoramento de erros (Sentry) no browser.
 *
 * LGPD (docs/CONFORMIDADE-LGPD.md): diagnóstico de erros captura IP, agente
 * do navegador e conteúdo da exceção — dados pessoais tratados por
 * consentimento (Art. 7º, I). Portanto o `Sentry.init` do cliente só pode
 * rodar depois que o titular concede a categoria `diagnosticos` — a decisão
 * "não decidido" também bloqueia (opt-in, Privacy by Default).
 *
 * PERF (docs/PROPOSTAS-PERF-A11Y.md, onda 1): a condição de DSN permanece
 * lida DIRETO de `process.env` dentro do ramo positivo — o DefinePlugin
 * inlineia a constante e o ConstPlugin poda o `import()` do SDK em builds
 * sem DSN (nenhum byte do Sentry no bundle nem no precache do PWA).
 * A checagem de consentimento vem ANTES do idle: sem opt-in, nem o agendamento
 * acontece.
 */
import { readConsent } from './consent';

/**
 * O titular concedeu `diagnosticos` (e há DSN configurado)? Puro e síncrono —
 * usado pelo contexto de consentimento para decidir carregar o SDK agora.
 */
export function diagnosticsConsented(): boolean {
  if (typeof window === 'undefined') return false;
  const consent = readConsent(window.localStorage);
  return consent?.diagnosticos === true;
}

/** Carrega o SDK quando o main-thread folgar (primeiro carregamento da sessão). */
export function loadDiagnosticsWhenIdle(): void {
  if (typeof window === 'undefined') return;
  if (!diagnosticsConsented()) return; // LGPD: sem opt-in, nada é agendado.
  const startDiagnostics = () => {
    // Ramo positivo da env direta: mantém a poda do SDK em build sem DSN.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import('../sentry-client-init');
    }
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(startDiagnostics, { timeout: 3000 });
  } else {
    window.addEventListener('load', startDiagnostics, { once: true });
  }
}

/** Consentimento concedido depois da carga (banner/preferências): init imediato. */
export function loadDiagnosticsNow(): void {
  if (typeof window === 'undefined') return;
  if (!diagnosticsConsented()) return;
  // Mesmo ramo da env direta — dedup de import garante init único em
  // conjunto com `loadDiagnosticsWhenIdle`.
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    void import('../sentry-client-init');
  }
}
