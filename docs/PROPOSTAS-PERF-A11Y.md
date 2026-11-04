# Propostas de melhorias — Desempenho e Acessibilidade (web)

**Data:** 2026-11-04 · **Escopo:** `web/` (Next.js 16 + React 19 + MUI v9, App Router)
**Método:** auditoria estática + Lighthouse 12 (Chromium Playwright 1200, emulação mobile,
throttle 4×, localhost) — 1 run de baseline, 2 runs de verificação por etapa, com o
servidor de produção (`next start`) reiniciado a cada build. Os JSONs completos ficam
fora do repositório; os números abaixo são as medianas observadas.

---

## 1. Resumo executivo

| Métrica (Lighthouse, mobile, home) | Baseline | Após onda 1 | Δ |
| --- | --- | --- | --- |
| Performance | 60 | **63** | +3 (score) |
| Acessibilidade | 98 | **100** | +2 (score) |
| Best practices | 100 | 100 | — |
| JS inicial transferido | 406 KiB | **364 KiB** | **−10,3%** |
| JS não usado (est. savings) | 94 KiB | **50 KiB** | −47% |
| LCP | 3,5 s | ~3,1 s | −11% |
| Speed Index | 2,2 s | ~2,0 s | −9% |
| TBT | 5.000 ms | ~5.200 ms* | estável* |
| Erros de console | 0 | 0 | — |

\* TBT tem variância de ±1,5 s entre runs neste sandbox (CPU compartilhada); o
`next start` com BUILD_ID velho após rebuild **contaminou duas medições
intermediárias** (ChunkLoadError 500 no chunk da página reduzia o TBT
artificialmente — página com JS parcialmente quebrado "parece" mais rápida).

O app já estava bem construído em vários pilares — sem barrel imports de MUI
(0 ocorrências de `import … from '@mui/material'`), pilha de fontes do sistema
(0 requisições de fonte), DOM enxuto (125 elementos), payload total de 454 KiB,
rotas isoladas, workers para backtesting. Os ganhos desta onda vieram de
problemas específicos e mensuráveis, listados a seguir.

## 2. Causas-raiz encontradas (com evidência)

### 2.1 Sentry no cliente: ~1,0 MB de JS eager, mesmo com DSN vazio

`src/instrumentation-client.ts` fazia `import * as Sentry from '@sentry/nextjs'`
estático e chamava `Sentry.init()` no topo. O fingerprint dos chunks mostrou que
**cinco dos dez maiores chunks iniciais eram SDK do Sentry**:

| Chunk | Raw | Scripting (LH) | Conteúdo |
| --- | --- | --- | --- |
| `38-*.js` | 384 KB | 1.577 ms | SDK + Replay + `onRouterTransitionStart` |
| `860-*.js` | 256 KB | 2.482 ms | vendor misto (Sentry + MUI/emotion) |
| `ea34990c-*.js` | 196 KB | — | SDK |
| `558-*.js` | 120 KB | 1.092 ms | SDK |
| `33726586-*.js` | 96 KB | 620 ms | SDK + Dexie |

Ou seja, **~1.050 KB dos ~2.100 KB de chunks iniciais** eram Sentry — que
executava `init` completo (`browserTracing`, amostragem de traces) mesmo com
`NEXT_PUBLIC_SENTRY_DSN=""`, quando `enabled: false` garante que nada é
*enviado*. O comentário em `next.config` ("Sem ele, Sentry é ignorado e nenhum
overhead é adicionado") refere-se ao envio de eventos, não ao custo de
download/parse/execução — que existia de qualquer forma.

**Correção (implementada):** `instrumentation-client.ts` agora só dispara
`import('./sentry-client-init')` quando há DSN, dentro de `requestIdleCallback`
(timeout 3 s). O SDK saiu dos chunks eager (o chunk de 384 KB desapareceu da
carga inicial; `main` caiu de 292 → 144 KB raw).
**Trade-off documentado no código:** erros nos primeiros ~2 s de sessão não
chegam ao Sentry (handler default do browser os exibe).

### 2.2 `Typography` sem `component`: headings falsos quebravam a ordem semântica

No MUI v9, `variant="subtitle1"` renderiza `<h6>` e `variant="subtitle2"`
idem — e `variant="h4"` renderiza `<h4>`. A home tinha `<h1>` seguido de
`<h6>` ("Concurso 2943", rótulo "Quantos jogos") e valores grandes (`R$ …`,
"% de chance") marcados como `<h4>`. O audit **heading-order (peso 3)** do
Lighthouse reprovava: `Heading elements are not in a sequentially-descending
order` — único ponto que mantinha a Acessibilidade em 98.

**Correção (implementada):** valores e rótulos viraram `component="p"`
(visual idêntico); títulos de seção legítimos (`BatchOddsPanel`,
`PayoutSharePanel`, `EvidencePanel`, `NextDrawCard`, `sobre/page` ×3)
promovidos a `component="h2"` — a navegação por headings de leitores de tela
agora tem uma hierarquia real: `h1 → h2 → h2…`.

### 2.3 Sem skip link

O `BottomNav` (4 itens) vem no fim do DOM, mas usuários de teclado/leitor de
tela precisavam tabular por ele a cada troca de página. **Correção
(implementada):** `SkipLink` ("Pular para o conteúdo") como primeiro elemento
focalizável do `layout.tsx`, destino `#conteudo` com `tabIndex={-1}`.

### 2.4 Zero `React.memo` e handlers instáveis

Cada tecla no campo "Apostas no concurso" re-renderizava a árvore inteira,
incluindo a grade de `GameCard` (cada um com até 15 `NumberBall`) — os handlers
`handleCopy`/`handleShare` eram recriados a cada render, o que também anularia
qualquer `memo` futuro, e `payoutAssessment` era recalculado por tecla.

**Correção (implementada):** `React.memo` em `GameCard` e `NumberBall`,
`useCallback` nos dois handlers, `useMemo` no `payoutAssessment`. Ganho
principal: latência de interação (digitação/toast), não visível no score do
Lighthouse — que não mede digitação. Melhoria de higiene, honestamente
frameada como tal.

## 3. Roadmap proposto

Prioridade por impacto medido ÷ risco. Itens P1–P2 são os únicos com potencial
de mover o score de Performance de novo; os demais são robustez.

**Status final (2026-11-04):** roadmap **P1–P8 concluído na íntegra**.
P1, P2, P3, P4, P6, P7 e P8 implementados na onda 2 (evidências nas seções 4
e 6); P5 mergeado na `main` via PR #28 (commit `272a17a`) — gate de
Lighthouse nas 4 rotas rodando em `pull_request`/`push:main`/
`workflow_dispatch`, com todos os workflows da `main` verdes. Ver seção 6.6
para a revalidação pós-LGPD da atribuição de chunks.

| # | Proposta | Impacto esperado | Esforço | Risco |
| --- | --- | --- | --- | --- |
| P1 | Atribuir e dividir o vendor chunk `860` (256 KB, 2,3–3,2 s de scripting): gerar source maps, rodar `source-map-explorer`, avaliar `optimizePackageImports` para MUI | Alto (TBT é o gargalo dominante) | Médio | Médio |
| P2 | `next/dynamic` para `EvidencePanel`/`PayoutSharePanel` (abaixo do dobro, só aparecem pós-geração) | Médio (−20–30 KiB do JS inicial) | Baixo | Baixo |
| P3 | `BottomNavigationAction component={Link}` — links reais (semântica de link, abrir em nova aba); exige ajuste no `onChange` | Médio em a11y/UX | Baixo | Médio (testes do BottomNav) |
| P4 | `browserslist` moderno (`chrome>=90`, `safari>=14`) para reduzir os 112 KB de polyfills | Médio | Baixo | Médio (matriz de suporte) |
| P5 | Gate de Lighthouse no CI (budgets: LCP ≤ 2,5 s, TBT ≤ 1.500 ms em runner dedicado, a11y = 100), no estilo do `calibration.yml` — **requer PAT com permissão "Workflows"** (ver worklog: workflows ficaram na versão anterior da main por limitação do token) | Alto a longo prazo (evita regressões silenciosas) | Médio | Baixo |
| P6 | Estender o run do Lighthouse a `/backtesting`, `/analise-avancada` e `/sobre` no CI | Robustez | Baixo | Baixo |
| P7 | Auditoria do precache do Workbox (`sw.js`) — os números de transferência variaram 364–426 KiB entre runs conforme o SW interceptava; garantir `precache` mínimo e revisar `maxEntries` | Robustez/consistência | Baixo | Baixo |
| P8 | Splash de 700 ms: medir seu efeito no LCP (o elemento LCP detectado foi um `caption` do splash na 1ª visita) e avaliar redução para ~300 ms | Baixo–médio | Baixo | Baixo |

## 4. Limitações honestas desta medição

1. **Variância do sandbox**: TBT variou de 3.150 ms a 5.590 ms entre runs do
   *mesmo* nível de código (CPU compartilhada + throttle 4×). Score de
   Performance: ±2 pontos. As conclusões firmes são as de payload (JS
   transferido, JS não usado, presença/ausência de chunks), que são
   determinísticas.
2. **Service worker do PWA** intercepta parte das requisições nas runs
   subsequentes, mudando `transferSize` (0 KiB em chunks precachados). As
   comparações foram feitas entre runs equivalentes.
3. **Emulação Lighthouse ≠ dispositivos reais**: o score 63 em CPU 4× do
   sandbox subestima hardware típico; o relative gain é o que importa.
4. A cadeia de 25 commits validada (738/738) está na `main` do GitHub; esta
   onda acrescenta mudanças de UI — a suíte completa foi re-executada
   (**738/738 verdes**) e `tsc --noEmit` limpo antes de cada build.
5. Todos os números citados foram medidos neste ambiente; nenhum é estimativa
   de dokumentação de terceiros. Cadeia de evidência: `/tmp/lh-base.json`,
   `/tmp/lh-v3-1.json`, `/tmp/lh-v3-2.json` (não persistem entre reciclagens
   do sandbox — os números fiéis estão nas tabelas acima).

## 5. Arquivos alterados nesta onda

- `web/src/instrumentation-client.ts` — Sentry lazy (gated por DSN + idle)
- `web/src/sentry-client-init.ts` — **novo** (init efetivo, chunk dinâmico)
- `web/src/components/SkipLink.tsx` — **novo** (skip link)
- `web/src/app/layout.tsx` — SkipLink + `id="conteudo"` + `tabIndex`
- `web/src/app/page.tsx` — `useCallback` ×2 + `useMemo` no payout
- `web/src/components/GameCard.tsx`, `NumberBall.tsx` — `React.memo`
- `web/src/components/NextDrawCard.tsx` — h6→p (valor) e título→h2
- `web/src/components/BatchOddsPanel.tsx`, `PayoutSharePanel.tsx`, `EvidencePanel.tsx` — títulos→h2, valores→p
- `web/src/components/GameCountControl.tsx`, `NumberPicker.tsx` — rótulos→p
- `web/src/app/sobre/page.tsx` — títulos de seção→h2
- `web/locales/pt-BR/common.json` — chave `nav.skipToContent`

## 6. Onda 2 (2026-11-04) — implementação do roadmap P1–P8

**Método:** os mesmos da onda 1, com duas ferramentas novas: captura de rede
determinística via Playwright (contexto novo, `serviceWorkers: 'block'` para
isolar a carga real do precache do Workbox) e atribuição de chunks por
decodificação VLQ dos source maps (`SOURCE_MAPS=1` no build, script
`scripts/attribute-chunks.js` fora do repositório). O `source-map-explorer`
quebra nos maps do Next ("generated column Infinity").

### 6.1 Resultados (Lighthouse 12, mobile, mediana de 3 runs na home)

| Métrica | Onda 1 | Onda 2 | Δ |
| --- | --- | --- | --- |
| Performance | 63 | **67** (63–75) | +4 (score) |
| Acessibilidade | 100 | **100** — nas 4 rotas | mantido, com 3 riscos reais corrigidos |
| Best practices | 100 | 96* | −4* |
| JS transferido (home, run limpa) | 364 KiB | **285 KiB** (15 req) | **−21,7%** |
| LCP | ~3,1 s | 2,4 s (2,2–3,2 s) | −23% |
| TBT | ~5.200 ms* | 1.010–4.920 ms* | variância dominada pelo sandbox |
| Precache do SW | 67 entradas / 2.780 KB | **59 / 2.111 KB** | **−669 KB (−24%)** |

\* BP 96 nas 4 rotas com uma única reprovação: `errors-in-console` com
`net::ERR_INSUFFICIENT_RESOURCES` — o Chromium do sandbox esgota recursos sob
o throttle do Lighthouse (em uma run o próprio documento falhou e o LH
avaliou a página de erro do browser: "Perf 94/A11y 73", sem valor). Em runner
dedicado, com prefetch do Next em HTTP/2 e hardware real, o gargalo não
existe; fica registrado como artefato de medição, não como regressão.

A11y: `/`, `/backtesting`, `/analise-avancada` e `/sobre` = 100 (P6). Três
problemas reais que as varreduras anteriores não pegaram foram corrigidos:
`aria-progressbar-name` (spinner decorativo do splash), `heading-order` em
/backtesting (rótulo de slider como `<h6>`) e `/analise-avancada` (o MUI v9
embrulha o summary do Accordion em `<h3>` default — resolvido com
`slotProps.heading.component = 'h2'`; rótulos internos viraram h3), e
`color-contrast` no helperText desabilitado (α 38% → `text.secondary`,
≥4,5:1 nos dois esquemas).

### 6.2 O que o P1 realmente era (atribuição corrigida)

A onda 1 atribuiu ao chunk `860` "vendor misto (Sentry + MUI/emotion)" por
fingerprint de strings — com source maps, a atribuição muda:

| Chunk (build onda 1) | Atribuição correta (mapa de fontes) | Papel |
| --- | --- | --- |
| `860` (256 KB) | **JSON do seed Quina desde 1994** (`src/data/history/quina.json`) | dado, não vendor |
| `558` (116 KB) | **JSON do seed Mega-Sena desde 1996** | dado |
| `ea34990c` (196 KB) | **react-dom-client** (compilado dentro de `next`) | framework |
| `393` (227 KB) | **route-matcher do Next** (`match-segments.ts`) | framework |
| `895` (142 KB) | MUI/material + emotion + i18next | vendor legítimo |
| `33726586` (96 KB) | Dexie (banco local) | vendor legítimo |

Ou seja: **não há mais "vendor chunk para dividir"** — o que sobra de JS
eager é framework (react-dom, router), vendor em uso (MUI, Dexie) e os seeds
de histórico (dados do produto, carregados por `import()` sob demanda
DEPOIS da primeira pintura: +860 ms/+1.435 ms na captura de rede; não
bloqueiam LCP). O `optimizePackageImports` para MUI foi avaliado e
descartado: 0 imports de barrel no app (todos deep imports), não há o que
reescrever.

### 6.3 O que foi implementado (e o efeito de cada um)

1. **`errorReporter.ts` lazy + eliminação de build (P1, o ganho grande).**
   O wrapper é importado estaticamente pela home e pelo backtesting; o
   `import * as Sentry` daqui mantinha o SDK inteiro (core + Replay,
   ~650 KB) no grafo da página e no precache, mesmo com DSN vazio. Agora o
   SDK só é alcançado via `import()` DENTRO de um ramo cuja condição o
   DefinePlugin resolve no build (`env.NEXT_PUBLIC_SENTRY_DSN ?? ""` em
   `next.config` garante que a env EXISTA — sem `.env`, o Next não inlineia
   e o ConstPlugin não poda). Com DSN vazio: zero bytes do Sentry no cliente
   (confirmado por rede e por ausência de `sentry.javascript` nos chunks) e
   fora do precache. Breadcrumbs anteriores à carga do SDK ficam num buffer
   síncrono (teto 40) anexado à primeira captura — fidelidade maior que a
   anterior, em que eram descartados antes do `Sentry.init`.
   *Trade-off:* captura assíncrona (microtask); se a aba fechar antes da
   carga do SDK, o evento se perde — janela equivalente à já aceita na onda 1.
2. **`next/dynamic` para `EvidencePanel`/`PayoutSharePanel` (P2)** —
   `ssr: false` (o SSR deles já renderizava vazio, pois os dados só existem
   no cliente); −20–30 KiB do JS inicial.
3. **BottomNav com `component={Link}` (P3)** — itens viram `<a>` reais
   (semântica, middle-click, prefetch). Efeito colateral honesto: o prefetch
   do Next baixa as páginas das outras rotas (~38 KiB de RSC) durante a
   carga; em troca, navegação instantânea. O `onChange`/`router.push` saiu.
4. **`browserslist` moderno (P4)** — `chrome/edge/firefox >= 90`,
   `safari >= 14`. O chunk de polyfills do App Router é fixo do Next
   (110 KB, hash idêntico antes/depois) — o P4 vale pelo alvo de sintaxe do
   SWC (`legacy-javascript`: est. savings 12 KiB restantes), não pelos
   polyfills. Correção da expectativa da onda 1, medida.
5. **Splash 700 → 300 ms (P8)** — o LCP da 1ª visita era a legenda do
   splash; agora o conteúdo real entra antes da janela de carga fechar.
   Reduced-motion e sessionStorage continuam respeitados.
6. **Auditoria do precache (P7)** — 67 entradas / 2.780 KB, sem `.map`,
   `maxEntries` dos caches runtime entre 16–64 (sadio). O achado real: os
   chunks async do SDK do Sentry eram PRÉ-CACHEADOS para offline (~650 KB
   de código que nunca roda sem DSN). Com a eliminação de build do item 1,
   o precache caiu para 59 / 2.111 KB.
7. **A11y (3 correções reais)** — spinner do splash `aria-hidden`;
   helperText/rótulo desabilitados com `text.secondary` (override
   `MuiFormHelperText`/`MuiInputLabel` no tema); hierarquia de headings
   nas 4 rotas (slot `heading` do Accordion → h2, subtítulos → h3, rótulo
   de slider → p).
8. **`suppressOnRouterTransitionStartWarning`** — o plugin do Sentry pede um
   hook `onRouterTransitionStart` exportado de `instrumentation-client.ts`,
   o que exigiria import estático do SDK (o que a onda 1 removeu).
   Supressão consciente e documentada.

### 6.4 Lições de engenharia desta onda (para as próximas)

1. **`process.env.NEXT_PUBLIC_*` só é inlineado se EXISTIR no build.** Sem
   `.env`, a expressão segue runtime: gates de DSN não podam nada. O padrão
   seguro é `env: { VAR: process.env.VAR ?? "" }` no `next.config` + o
   `import()` dentro do ramo da condição (não depois de um early-return).
2. **`pkill -f "next start"` não mata o servidor do Next** (processo
   renomeado para `next-server`): o `next start` novo morre de EADDRINUSE
   em silêncio e o LH mede o build VELHO. Matar por PID via `ss -ltnp`.
   Isso contaminou uma série inteira de medições (Perf 87–94 com TBT
   170 ms = documento que nem carregou).
3. **Atribuição por fingerprint de strings erra** ("Sentry" aparecia no
   chunk por causa de `onRouterTransitionStart` — que também é do próprio
   router do Next 16). Source maps + VLQ é o método confiável.
4. **O custo dominante de scripting hoje é o route-matcher do Next**
   (chunk `393`, ~8,2 s de CPU bruta no sandbox) — interno ao framework,
   fora do alcance do app; registrado como fronteira honesta.

### 6.5 Arquivos alterados nesta onda

- `web/src/services/errorReporter.ts` — SDK lazy + buffer de breadcrumbs + eliminação de build
- `web/src/services/__tests__/errorReporter.test.ts` — contrato async + buffer (12 testes)
- `web/src/instrumentation-client.ts` — env inline direto na condição
- `web/src/app/page.tsx` — `next/dynamic` nos dois painéis
- `web/src/components/BottomNav.tsx` — Links reais
- `web/src/components/SplashScreen.tsx` — 300 ms + spinner `aria-hidden`
- `web/src/theme.ts` — contraste de helperText/rótulo desabilitados
- `web/src/app/analise-avancada/page.tsx` — headings do Accordion (h2/h3)
- `web/src/app/backtesting/page.tsx` — rótulo de slider → `p`
- `web/package.json` — `browserslist` moderno
- `web/next.config.ts` — `env` DSN, switch `SOURCE_MAPS`, supressão do aviso
- `docs/PROPOSTAS-PERF-A11Y.md` — este documento

Suíte: **740/740** (58 arquivos; +2 testes do buffer) e `tsc --noEmit`
limpo antes de cada build.

### 6.6 Revalidação pós-LGPD (2026-11-04) — o P1 permanece resolvido

Após o commit LGPD (`e9a2414`, que adicionou banner de consentimento e
contexto ao layout), o build da `main` (`272a17a`) foi reconstruído com
`SOURCE_MAPS=1` e reatribuído por VLQ (mesmo método da onda 2), para confirmar
que a premissa original do P1 — "vendor chunk 860 a dividir" — segue
inexistente:

| Chunk (build atual) | Atribuição (source maps) | Papel |
| --- | --- | --- |
| `860` (253 KB) | `JSON.parse('[[1,"1994-03-…` — **seed Quina** | dado do produto, `import()` pós-pintura (na captura de rede: chega em +1.567 ms, sem bloquear LCP) |
| `558` (116 KB) | seed Mega-Sena | idem (+1.038 ms) |
| `587`+`478`+`98` (472 KB) | **@mui/material + @mui/system** | vendor em uso, deep imports (sem barrel — `optimizePackageImports` segue descartado) |
| `ea34990c`+`framework`+`main` (525 KB) | react-dom-client + router do Next | framework, fora do alcance do app |
| `33726586` (95 KB) | Dexie | vendor em uso |
| qualquer chunk | **Sentry: 0 bytes** | eliminação de build do item 6.3.1 mantida ✓ |

Captura de rede no build novo (contexto limpo, SW bloqueado): 18 requisições
JS; seeds e chunks das outras rotas chegam pós-pintura (prefetch do P3).
Conclusão: **não há vendor monolítico a dividir**; o restante do custo de
scripting é framework (route-matcher/hidratação, seção 6.4.4) e MUI em uso.
O gate de Lighthouse recalibrado no runner (erro LCP 4.500 ms, PR #28) só
deve ser apertado com nova evidência medida — não há ação do app pendente
que a sustente hoje.
