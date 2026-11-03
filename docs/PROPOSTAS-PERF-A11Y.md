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

## 3. Roadmap proposto (não implementado nesta onda)

Prioridade por impacto medido ÷ risco. Itens P1–P2 são os únicos com potencial
de mover o score de Performance de novo; os demais são robustez.

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
