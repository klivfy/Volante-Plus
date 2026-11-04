import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Mesmo host padrão de `src/services/caixaApi.ts` — o service worker precisa
 * saber, em tempo de build, qual origem tratar como "API da Caixa" para
 * aplicar network-first (dados voláteis, mas ainda utilizáveis do cache
 * offline).
 */
const CAIXA_API_BASE_URL =
  process.env.NEXT_PUBLIC_CAIXA_API_BASE_URL ?? "https://loteriascaixa-api.herokuapp.com/api";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  extendDefaultRuntimeCaching: true,
  // Handlers de push/notificationclick/periodicsync que o Workbox não cobre;
  // next-pwa compila este arquivo e o injeta no sw.js gerado. Ver
  // `src/worker/index.ts`.
  customWorkerSrc: "src/worker",
  customWorkerDest: "public",
  workboxOptions: {
    skipWaiting: true,
    // Pentest 2026-11: sem source map do sw gerado — vazava o TS original
    // (sourcesContent) em público. Resíduos do worker customizado são
    // removidos por scripts/strip-pwa-maps.mjs no pós-build.
    sourcemap: false,
    runtimeCaching: [
      {
        urlPattern: new RegExp(`^${escapeRegExp(CAIXA_API_BASE_URL)}/.*`),
        handler: "NetworkFirst",
        options: {
          cacheName: "caixa-api",
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 16, maxAgeSeconds: 6 * 60 * 60 },
        },
      },
      // Sobrescreve o padrão stale-while-revalidate do next-pwa (mesmo
      // cacheName) por cache-first: fontes e CSS do build são versionados
      // por hash no nome do arquivo, então uma URL nunca muda de conteúdo.
      {
        urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font\.css)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "static-font-assets",
          expiration: { maxEntries: 4, maxAgeSeconds: 31536000 },
        },
      },
      {
        urlPattern: /\.(?:css|less)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "static-style-assets",
          expiration: { maxEntries: 32, maxAgeSeconds: 86400 },
        },
      },
    ],
  },
});

/**
 * Cabeçalhos de segurança. O CSP agora tem `script-src`: `self` cobre o
 * bootstrap do Next e todos os chunks (o SDK do Sentry, quando há DSN, é
 * empacotado localmente — nunca vem de CDN), `unsafe-inline` cobre os
 * scripts inline de hidratação do Next e a origem do Plausible cobre o
 * script de métricas (LGPD: injetado só com consentimento — ver
 * `PlausibleScript.tsx`). O worker do backtest é same-origin, coberto por
 * `self` (worker-src herda de script-src). Sem `connect-src`/`default-src`
 * de propósito: restringir saídas quebraria a API da Caixa e o ingest do
 * Sentry, que variam por deploy.
 */
const plausibleOrigin = (() => {
  const host = process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST || "https://plausible.io";
  try {
    return new URL(host).origin;
  } catch {
    return "https://plausible.io";
  }
})();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' ${plausibleOrigin}`,
  },
];

const nextConfig: NextConfig = {
  // Pentest 2026-11: 'X-Powered-By: Next.js' só serve para fingerprint de
  // tecnologia; sem utilidade, sem header.
  poweredByHeader: false,
  // Garante que o DSN esteja DEFINIDO no build mesmo sem .env: o DefinePlugin
  // do Next só inlineia NEXT_PUBLIC_* presentes em process.env — sem isso o
  // teste de DSN em errorReporter/instrumentation-client segue runtime e o
  // ConstPlugin não poda o ramo do SDK (chunks mortos + ~650 KB no precache).
  // Com DSN real no ambiente, o valor real é inlineado e os chunks voltam.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  },
  // PERF (P1, docs/PROPOSTAS-PERF-A11Y.md): switch de auditoria —
  // `SOURCE_MAPS=1 bun run build` gera .map para source-map-explorer
  // atribuir o conteúdo dos chunks. Não é o padrão de produção: os .map
  // somam MBs ao deploy e nada no pipeline os consome hoje.
  ...(process.env.SOURCE_MAPS === "1" ? { productionBrowserSourceMaps: true } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Auditoria (SOURCE_MAPS=1): Next só liga devtool no client com
  // productionBrowserSourceMaps, mas o plugin do Sentry sobrescreve devtool —
  // o override explícito aqui roda por último e garante os .map no output.
  webpack: (config) => {
    if (process.env.SOURCE_MAPS === "1") {
      config.devtool = "source-map";
    }
    return config;
  },
};

// WHY (--webpack no build): a partir do Next 16, Turbopack é o bundler
// padrão para `next build`, mas ele ignora por completo a config
// `webpack()` e não suporta plugins de webpack — o WorkboxWebpackPlugin
// usado por `next-pwa` para gerar o service worker nunca rodaria. O script
// `build` em package.json passa `--webpack` para voltar a usar webpack só
// no build de produção (o dev continua em Turbopack).
const pwaConfig = withPWA(nextConfig);

// NOTA (P1, onda 2): a hipótese de "injeção do plugin do Sentry no client"
// foi testada e DESCARTADA — em @sentry/nextjs 10.69 a instrumentação de
// router vem de um hook exportado pelo usuário (`onRouterTransitionStart` em
// instrumentation-client.ts, que este app não exporta) e não de injeção do
// plugin. Os chunks grandes eager são do próprio Next/MUI — ver atribuição
// no PROPOSTAS-PERF-A11Y.md.

export default withSentryConfig(pwaConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  // O hook `onRouterTransitionStart` exigiria `import * as Sentry` estático
  // em instrumentation-client.ts — exatamente o que a onda 1 de PERF removeu
  // (~1 MB de SDK eager). Sem DSN nada é enviado; com DSN, o init lazy segue
  // cobrindo erros. Aviso de build suprimido de forma consciente.
  suppressOnRouterTransitionStartWarning: true,
  // Auditoria (SOURCE_MAPS=1): desativa o processamento de source maps do
  // plugin (que apaga os .map do client) para o source-map-explorer atribuir
  // o conteúdo dos chunks. Padrão (processar/apagar) permanece na produção.
  sourcemaps: { disable: process.env.SOURCE_MAPS === "1" },
});
