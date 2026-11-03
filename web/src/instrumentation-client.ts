/**
 * Instrumentação do cliente (browser). O arquivo `instrumentation-client.ts`
 * é a convenção do Next 15+/Turbopack — o client config antigo em
 * `next.config.js` nunca é lido, o que deixava o Sentry do browser desligado.
 *
 * PERF (medido no Lighthouse, ver docs/PROPOSTAS-PERF-A11Y.md): o import
 * estático do SDK trazia ~1,0 MB de JS do Sentry para os chunks iniciais —
 * mesmo com DSN vazio, quando nada era enviado — e o `init` custava centenas
 * de ms de main-thread (TBT 5,0 s no baseline). O SDK só entra em cena via
 * `import()` dinâmico, depois da primeira pintura.
 *
 * LGPD (docs/CONFORMIDADE-LGPD.md): diagnóstico de erros captura IP, agente
 * do navegador e conteúdo da exceção — dados pessoais sob consentimento
 * (Art. 7º, I). O agendamento só acontece quando o titular JÁ concedeu a
 * categoria `diagnosticos` (opt-in; "não decidido" também bloqueia). Com o
 * consentimento concedido tardiamente no banner/preferências, o contexto de
 * consentimento chama `loadDiagnosticsNow()`.
 *
 * Trade-off aceito: erros lançados nos primeiros ~2 s de sessão (antes do
 * idle) não chegam ao Sentry — o handler default do browser os exibe
 * normalmente. O ganho de TBT/LCP compensa a janela perdida.
 */
import { loadDiagnosticsWhenIdle } from './services/diagnostics';

// O gate de DSN + consentimento vive em `services/diagnostics.ts`: a env é
// lida DIRETO na condição (sem const intermediária) para o DefinePlugin
// inlinear e o ConstPlugin podar o `import()` do SDK em builds sem DSN —
// nenhum byte do Sentry no bundle nem no precache do PWA. Ver
// errorReporter.ts.
if (typeof window !== 'undefined') {
  loadDiagnosticsWhenIdle();
}
