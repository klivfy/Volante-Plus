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

const nextConfig: NextConfig = {
  /* config options here */
};

// WHY (--webpack no build): a partir do Next 16, Turbopack é o bundler
// padrão para `next build`, mas ele ignora por completo a config
// `webpack()` e não suporta plugins de webpack — o WorkboxWebpackPlugin
// usado por `next-pwa` para gerar o service worker nunca rodaria. O script
// `build` em package.json passa `--webpack` para voltar a usar webpack só
// no build de produção (o dev continua em Turbopack).
const pwaConfig = withPWA(nextConfig);

// Sentry é inicializado automaticamente quando NEXT_PUBLIC_SENTRY_DSN está
// definido. Sem ele, Sentry é ignorado e nenhum overhead é adicionado.
export default withSentryConfig(pwaConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
});
