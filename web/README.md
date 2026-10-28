# Volante+ Web (Next.js + PWA)

Laboratório estatístico de loterias brasileiras (Mega-Sena, +Milionária e
Quina) no navegador — mesma lógica de domínio do app Android, reimplementada
em TypeScript puro em `src/engine/` (portável para Web Worker, sem
dependência de DOM).

## Stack

- **Next.js 16** (App Router, `src/app`) + **React 19**
- **MUI** (Material Design 3 via tema próprio — todo o estilo é `sx`, sem Tailwind)
- **Dexie** (IndexedDB) para histórico, cache de backtest e configurações
- **Vitest** (ambiente `node`, 550+ testes) + **Playwright** (E2E)
- **@sentry/nextjs** via `instrumentation*.ts` (convenção Next 15+/Turbopack)
- **Plausible** para telemetria de uso (privacy-first)

## Estrutura

```
src/
  engine/        # motor estatístico puro (backtest, geração, fechamentos, auditoria)
    audit/       # protocolo pré-registrado de anomalias/previsibilidade
  app/           # rotas: volante, backtesting, análise avançada, sobre, API de push
  components/    # componentes de UI (MUI)
  hooks/         # usePerformanceCache, usePushNotifications, workers...
  services/      # Dexie, fontes de dados, sync, push, telemetria
  workers/       # Web Worker do backtesting
locales/         # i18n (pt-BR)
public/          # manifest PWA, service worker, ícones
```

## Comandos

```bash
npm install
npm run dev        # desenvolvimento (http://localhost:3000)
npm run build      # build de produção
npm run test       # suíte completa (vitest, ambiente node)
npm run lint       # eslint
npx tsc --noEmit   # verificação de tipos
```

## Notas de engenharia

- O motor (`src/engine`) é TypeScript puro, testado em ambiente `node` —
  nada de UI dentro dele. Regras oficiais por modalidade em
  `src/engine/prizeRules.ts` (espelho de `shared/.../PrizeRules.kt`).
- O backtesting roda em Web Worker (`src/workers/backtest.worker.ts`) para
  não travar a UI; o resultado vira cache no IndexedDB com origem
  `manual`/`auto` (o cache manual nunca é sobrescrito pelo automático).
- Push: sem `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`PUSH_VAPID_*` no build, a UI
  esconde o opt-in e as rotas de API devolvem 503 — nada quebra.
- Versão única em `package.json`; sincronize os manifests da extensão com
  `node ../scripts/sync-extension-versions.mjs <versão>`.

Mais detalhes de arquitetura em `../docs/WEB.md`.
