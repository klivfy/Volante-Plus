import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gerados por next-pwa a cada build de produção (ver .gitignore) — não
    // é código nosso, é o bundle minificado do workbox-webpack-plugin.
    "public/sw.js",
    "public/workbox-*.js",
    "public/swe-worker*.js",
    "public/worker-*.js",
  ]),
]);

export default eslintConfig;
