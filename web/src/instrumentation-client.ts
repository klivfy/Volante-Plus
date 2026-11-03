/**
 * Instrumentação do cliente (browser). O arquivo `instrumentation-client.ts`
 * é a convenção do Next 15+/Turbopack — o client config antigo em
 * `next.config.js` nunca é lido, o que deixava o Sentry do browser desligado.
 *
 * PERF (medido no Lighthouse, ver docs/PROPOSTAS-PERF-A11Y.md): o import
 * estático do SDK trazia ~1,0 MB de JS do Sentry para os chunks iniciais —
 * mesmo com DSN vazio, quando nada era enviado — e o `init` custava centenas
 * de ms de main-thread (TBT 5,0 s no baseline). Agora o SDK só entra em cena
 * com DSN configurado e, mesmo assim, depois da primeira pintura, em
 * `requestIdleCallback`.
 *
 * Trade-off aceito: erros lançados nos primeiros ~2 s de sessão (antes do
 * idle) não chegam ao Sentry — o handler default do browser os exibe
 * normalmente. O ganho de TBT/LCP compensa a janela perdida.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== 'undefined') {
  const startSentry = () => {
    void import('./sentry-client-init');
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(startSentry, { timeout: 3000 });
  } else {
    window.addEventListener('load', startSentry, { once: true });
  }
}
