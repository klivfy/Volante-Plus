# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

Monorepo do Volante+, laboratório estatístico de Mega-Sena, +Milionária e Quina. O produto testa hipóteses por backtesting sobre o histórico oficial da Caixa. Não há promessa preditiva: qualquer alegação precisa de evidência replicada (ver `.specify/memory/constitution.md`, Princípios I–VI, que governam o desenvolvimento).

Plataformas:
- `web/`: Next.js 16 (App Router) + TypeScript + MUI. PWA, sem backend próprio. Tem `web/AGENTS.md` com alerta de breaking changes do Next.js e as regras do Astryx em `web/CLAUDE.md`.
- `app/` (Android), `shared/` e `desktop/`: Kotlin + Compose. `shared/` é o módulo Kotlin Multiplatform com o domínio (backtesting, geração de jogos, modelos) compartilhado entre Android e desktop.
- `extension/`: extensão de navegador (Chrome/Edge/Firefox), com popup próprio em `extension/popup-app/`.
- `specs/001..003`: features no formato Spec Kit (spec, plan, tasks).

## Comandos

### Web (`cd web`)

```bash
npm ci
npm run dev                      # servidor de desenvolvimento
npm run lint                     # eslint
npm test                         # vitest run (só src/**/*.test.ts, ambiente node)
npx vitest run src/engine/backtestEngine.test.ts   # um arquivo
npx vitest run -t "nome do teste" # um teste pelo nome
npm run build                    # next build --webpack + strip de source maps do PWA
npm run test:e2e                 # playwright (usar --trace off salvo pedido contrário)
npm run audit:gate               # falha se houver vulnerabilidade high/critical fora da baseline
```

### Android e Kotlin (raiz, `./gradlew`)

```bash
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest :shared:desktopTest   # unitários + teste dourado web–Kotlin
./gradlew :desktop:run                                 # app desktop local
./gradlew :desktop:packageMsi                          # só roda no Windows
```

Requer JDK 17+ e Android SDK (compileSdk 35).

### Extensão

```bash
cd extension && npm ci && cd popup-app && npm ci && cd ..
node build.mjs                    # gera chrome/edge/firefox em extension/dist
```

### Paridade e auditoria

- `bash scripts/kotlin-golden-check.sh`: testes dourados web–Kotlin sem Android SDK.
- `node scripts/audit-report.mjs`: relatório de auditoria reciclável.
- `node scripts/provenance-check.mjs`: procedência do histórico.
- `node scripts/generate-android-seed.mjs`: regenera `assets/seed/` do Android a partir do histórico validado no web.

## Arquitetura (big picture)

**Domínio duplicado por plataforma, com paridade verificada.** A lógica de backtesting e geração existe em TypeScript (`web/src/engine/`) e em Kotlin (`shared/`). Os testes dourados em `web/src/engine/golden` e `shared` comparam as duas implementações com fixtures JSON compartilhadas (`docs/golden-parity.md`). Ao mudar regra de cálculo, geração ou premiação, altere as duas e rode o golden check. As constantes de `gameGenerator.ts` espelham as de `shared/` (ver `docs/DESKTOP.md` e `docs/WEB.md`).

**Motor do web é TypeScript puro.** `web/src/engine/` não importa UI nem Node, para rodar no navegador e no Service Worker. A UI pesada roda no worker `web/src/workers/backtest.worker.ts`. Nova lógica estatística vai em `engine/` com teste em `engine/__tests__`.

**Histórico e dados locais.** `web/src/services/` concentra a sincronização: `drawSources.ts` faz fallback entre fontes, `historySync.ts` preenche lacunas por diff com o último concurso, e `syncService.ts` orquestra abertura, troca de aba e intervalo de 30 min. Persistência em Dexie/IndexedDB (`services/db.ts`). No Android, o equivalente é Room em `app/.../data/local` e a importação em `data/seed` e `data/remote`.

**Protocolo de backtesting.** Corte de data, treino e validação, métricas de eficácia e variância, controles positivo e negativo. Um controle negativo que "acerta" invalida o instrumento. A ordem é: pré-registro da hipótese antes de olhar o dado (Princípio II), depois o resultado. Regras do protocolo estão em `.specify/memory/constitution.md` e `docs/calibration-contract.md`.

**Servidor mínimo.** As únicas rotas de API do web são de push (`web/src/app/api/push/subscribe` e `send`, com `web/src/server/`). O restante roda no cliente, o que é parte da política LGPD (`docs/CONFORMIDADE-LGPD.md`): fontes auto-hospedadas, analytics só com consentimento (`services/consent.ts`, `components/consent/`).

**Tema.** Web usa MUI com temas por loteria em `web/src/theme.ts` e `context/LotteryThemeContext`. Claro e escuro saem de variáveis CSS, não de troca em JavaScript depois da hidratação. O Astryx está instalado com o tema neutro (`web/src/astryx-themes.ts` é gerado e não é importado pelo app, porque `fonts.css` puxa Google Fonts).

**Deploy.** `netlify.toml` define `base = "web"`. O Vercel usa `vercel.json`. O CI de web (`.github/workflows/web-ci.yml`) roda audit gate, lint, testes e build, e empacota as extensões. Os workflows do Android e do desktop ficam em `android-ci.yml` e `desktop-ci.yml`.

## Convenções do repositório

- Documentação e mensagens de commit em português. Specs seguem Spec Kit em `specs/NNN-nome/`.
- Quina existe em web, Android e desktop. O fechamento com garantia é só web: no Android e no desktop, a guarda recusa em vez de prometer cobertura que as tabelas não provam (`CHANGELOG.md`, `[Unreleased]`).
- Ao mexer em dependências do Astryx, rode `upgrade --from <versão antiga> --apply` (ver `web/CLAUDE.md`).
