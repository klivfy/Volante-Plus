// Gate de dependências no CI — recomendação nº 1 da auditoria de segurança
// (docs/AUDITORIA-SEGURANCA.md §6) e nº 5 do pentest (docs/PENTEST-2026-11-04.md §5).
//
// Executa `npm audit --omit=dev --json` e falha o build se aparecer
// vulnerabilidade **high ou critical** fora da baseline aceita e documentada.
// Moderadas/low são reportadas, mas não falham — a baseline inteira é
// build-time (geração do service worker e plugin do Sentry) e nunca chega ao
// runtime de produção; os critérios de aceitação estão em
// docs/AUDITORIA-SEGURANCA.md §3 e são reavaliados a cada upgrade do
// next-pwa/Sentry. Quando um item da baseline deixar de aparecer no audit,
// o gate avisa para que a entrada seja removida daqui.
//
// Roda no Web CI logo após `npm ci`:
//   npm run audit:gate
//
// Código de saída: 0 = dentro da baseline; 1 = vulnerabilidade nova de
// runtime (high/critical) fora da baseline; 2 = erro de ambiente (audit não
// produziu JSON).

import { execFileSync } from 'node:child_process';
import process from 'node:process';

// Baseline aceita e documentada — chave: nome do pacote; valor: motivo.
// NÃO adicione pacotes aqui sem justificativa escrita na auditoria.
const BASELINE = new Map([
  // Cadeia build-time do next-pwa/workbox (§3 da auditoria): só executa na
  // geração do sw.js, sem entrada de atacante, sem fix upstream hoje.
  ['@ducanh2912/next-pwa', 'cadeia workbox build-time (§3)'],
  ['workbox-build', 'cadeia workbox build-time (§3)'],
  ['workbox-webpack-plugin', 'cadeia workbox build-time (§3)'],
  ['@rollup/plugin-node-resolve', 'cadeia workbox build-time (§3)'],
  ['@rollup/plugin-terser', 'cadeia workbox build-time (§3)'],
  ['@surma/rollup-plugin-off-main-thread', 'cadeia workbox build-time (§3)'],
  ['deepmerge', 'cadeia workbox build-time (§3)'],
  ['ejs', 'cadeia workbox build-time (§3)'],
  ['jake', 'cadeia workbox build-time (§3)'],
  ['filelist', 'cadeia workbox build-time (§3)'],
  ['minimatch', 'cadeia workbox build-time (§3)'],
  ['serialize-javascript', 'HIGH sem fix upstream; só no build do SW (§3)'],
  // Cadeia do plugin do Sentry (upload de source maps no build, §2.2/§3).
  ['@sentry/bundler-plugins', 'cadeia do plugin Sentry build-time (§2.2)'],
  ['@sentry/webpack-plugin', 'cadeia do plugin Sentry build-time (§2.2)'],
  ['@sentry/nextjs', 'cadeia do plugin Sentry build-time (§2.2)'],
  ['glob', 'cadeia do plugin Sentry build-time (§2.2)'],
]);

const SEVERIDADES = ['info', 'low', 'moderate', 'high', 'critical'];

function main() {
  let raw;
  try {
    raw = execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      // --workspaces=false: garante que o audit é da árvore deste
      // package.json, mesmo se um diretório pai declarar workspaces (npm
      // sobe na hierarquia procurando um root — em checkout de CI não há
      // pai, mas a garantia explícita não custa e evita falso-negativo).
      ['audit', '--omit=dev', '--workspaces=false', '--json'],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
  } catch (err) {
    // npm audit sai com código != 0 quando há vulnerabilidades; o stdout
    // ainda é o JSON que interessa. Só tratamos como erro de ambiente se
    // não houver JSON utilizável.
    raw = err && typeof err.stdout === 'string' ? err.stdout : '';
    if (!raw.trim().startsWith('{')) {
      console.error('audit-gate: npm audit não produziu JSON — erro de ambiente.');
      console.error(String(err && err.message ? err.message : err));
      process.exit(2);
    }
  }

  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    console.error('audit-gate: JSON do npm audit inválido.');
    process.exit(2);
  }

  const meta = report.metadata?.vulnerabilities ?? {};
  const vulns = report.vulnerabilities ?? {};

  const novas = [];
  for (const [nome, v] of Object.entries(vulns)) {
    if ((v.severity === 'high' || v.severity === 'critical') && !BASELINE.has(nome)) {
      novas.push({ nome, severity: v.severity, via: v.via, fix: v.fixAvailable });
    }
  }

  const resumo = SEVERIDADES.map((s) => `${s}=${meta[s] ?? 0}`).join(' ');
  console.log(`audit-gate: runtime (--omit=dev) → total=${meta.total ?? '?'} (${resumo})`);
  console.log(`audit-gate: baseline aceita = ${BASELINE.size} pacotes (docs/AUDITORIA-SEGURANCA.md §3)`);

  if (novas.length > 0) {
    console.error('\naudit-gate: VULNERABILIDADE(S) DE RUNTIME FORA DA BASELINE:');
    for (const f of novas) {
      console.error(`  - ${f.nome} [${f.severity}] fix=${JSON.stringify(f.fix)}`);
      for (const via of f.via) {
        if (typeof via === 'object' && via.url) console.error(`      ${via.title} — ${via.url}`);
      }
    }
    console.error('\nCorrija com `npm audit fix`/upgrade do pacote, ou — se build-time e sem fix —');
    console.error('documente a aceitação em docs/AUDITORIA-SEGURANCA.md §3 e adicione-a à');
    console.error('baseline em web/scripts/audit-gate.mjs com justificativa.');
    process.exit(1);
  }

  // Limpeza: entradas da baseline que sumiram do audit devem sair da lista.
  for (const nome of BASELINE.keys()) {
    if (!vulns[nome]) {
      console.warn(`audit-gate: '${nome}' não aparece mais no audit — remova da baseline em web/scripts/audit-gate.mjs`);
    }
  }
  console.log('audit-gate: OK — nenhuma vulnerabilidade de runtime fora da baseline.');
}

main();
