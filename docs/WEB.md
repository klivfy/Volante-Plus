# Volante+ Web

Versão web do Volante+ (`web/`): Next.js 16 (App Router, Turbopack), TypeScript,
Material Design 3 via MUI. Mesma proposta do app Android — gerar jogos e rodar
backtesting contra o histórico oficial da Caixa — só que rodando inteiramente
no navegador, sem backend próprio.

## Arquitetura

```
web/
├── src/
│   ├── app/                # Rotas (App Router)
│   │   ├── page.tsx        # Volante — geração de jogos
│   │   ├── backtesting/    # Backtesting
│   │   └── sobre/          # Sobre
│   ├── engine/              # Motor de análise/geração — TypeScript puro,
│   │                        # sem import de UI/Node. Roda em navegador ou
│   │                        # Service Worker.
│   │   ├── hypergeometric.ts    # Distribuição hipergeométrica, baseline teórico
│   │   ├── backtestAnalyzer.ts  # Ranking de dezenas por desempenho histórico
│   │   ├── gameGenerator.ts     # Geração de jogos ponderada por tier
│   │   ├── backtestEngine.ts    # Simulação treino/validação com métricas
│   │   ├── prizeRules.ts        # Faixas de premiação por loteria
│   │   └── random.ts            # RandomSource (crypto.getRandomValues + fallback)
│   ├── services/
│   │   ├── caixaApi.ts      # Busca do próximo concurso (API pública de terceiros)
│   │   └── db.ts            # Persistência local (Dexie/IndexedDB)
│   ├── hooks/useNextDraw.ts # Cache em memória (6h) sobre caixaApi
│   ├── components/          # NextDrawCard, BottomNav
│   ├── types/domain.ts      # Tipos e enums compartilhados
│   └── theme.ts             # Temas MD3 claro/escuro
├── e2e/                     # Testes end-to-end (Playwright)
└── public/manifest.json     # Manifest do PWA
```

O motor (`engine/`) é o mesmo algoritmo do Android (`BacktestAnalyzer.kt`,
`GameGenerator.kt`, `BacktestEngine.kt`), reescrito em TypeScript preservando
os pesos e fórmulas — não é uma reinterpretação. Por ser puro (sem `window`,
sem Node), o mesmo código serve tanto a UI quanto o service worker.

### Fluxo de dados

1. `caixaApi.fetchNextDraw()` busca o próximo concurso numa API pública de
   terceiros (não o serviço oficial da Caixa — ver [Variáveis de ambiente](#variáveis-de-ambiente)).
   Falha de rede/parsing devolve `null`, nunca lança — a UI trata isso como
   "indisponível", não como erro.
2. `db.ts` (Dexie) guarda o histórico de concursos (`draws`) e o desempenho
   calculado por dezena (`performances`) no IndexedDB do navegador. Todo o
   histórico usado pelo backtesting vem de aqui — o app não faz sync
   automático de histórico completo hoje (isso existe no Android via seed
   local; na web, a tela de Backtesting é quem popula o cache de performances
   a partir do que estiver salvo).
3. `analyzeBacktest()`/`analyzeTrevoBacktest()` transformam o histórico em
   `NumberPerformance[]` (peso 0–1 e tier top/mid/low por dezena).
4. `generateGames()` sorteia jogos priorizando o tier `top`, com não-repetição
   entre jogos do mesmo lote.

## Rodando localmente

```bash
cd web
npm install
npm run dev          # http://localhost:3000, Turbopack
```

## Build de produção

```bash
npm run build         # next build --webpack (ver nota abaixo)
npm run start
```

**Por que `--webpack` no build:** a partir do Next 16, Turbopack é o bundler
padrão também para `next build`, mas ele não suporta plugins de webpack —
e o service worker do PWA (`@ducanh2912/next-pwa`, que usa
`workbox-webpack-plugin`) depende de um. Sem a flag, o build "funciona" mas
não gera `public/sw.js`, silenciosamente. `next dev` continua em Turbopack
normalmente (o service worker só importa em produção).

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_CAIXA_API_BASE_URL` | Não (tem padrão) | Host da API usada por `fetchNextDraw()` para o próximo concurso. Padrão: a API pública de terceiros [loteriascaixa-api](https://github.com/guto-alves/loterias-api) — **não é o serviço oficial da Caixa**. Aponte para outra API compatível (mesmo shape de resposta) ou para uma instância própria se preferir. |

Veja `.env.example`. Sem essa variável configurada corretamente (ou com o
serviço de terceiros fora do ar), o card de "próximo concurso" mostra o
estado offline — o resto do app (geração de jogos, backtesting) não depende
dela.

## Deploy

O projeto não tem infraestrutura própria de servidor (sem rotas de API, sem
banco remoto) — é estático o suficiente para qualquer host de arquivos
estáticos/edge que rode Next.js. O workflow de CI (`.github/workflows/web-ci.yml`)
inclui um passo opcional de deploy para a [Vercel](https://vercel.com/), que só
roda quando os secrets abaixo estiverem configurados no repositório
(**Settings → Secrets and variables → Actions**):

| Secret | Descrição |
|---|---|
| `VERCEL_TOKEN` | Token de deploy da conta/organização Vercel. |
| `VERCEL_ORG_ID` | ID da organização Vercel (`.vercel/project.json` após `vercel link`). |
| `VERCEL_PROJECT_ID` | ID do projeto Vercel. |

Sem esses secrets, o job de deploy é pulado — o resto do CI (lint, testes,
build) continua rodando normalmente. Para deploy manual: `npx vercel --cwd web`.

## Testes

```bash
npm test              # Vitest — unitários (engine, services)
npm run test:e2e       # Playwright — fluxo completo + offline (ver docs/PWA.md)
```

`test:e2e` precisa de um build de produção (`npm run build`) antes — os
testes offline dependem do service worker gerado nesse build.
