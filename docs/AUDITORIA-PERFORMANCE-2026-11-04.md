# Auditoria de performance — por que a aplicação está lenta (2026-11-04)

Diagnóstico estrutural solicitado após relato de lentidão. Diferente da onda
anterior (`PROPOSTAS-PERF-A11Y.md`, que corrigiu o Sentry eager e a11y), esta
auditoria mede o estado **atual** do app, identifica onde o tempo vai e propõe
um plano estrutural priorizado. Todos os números abaixo foram medidos no
sandbox de auditoria com build de produção; a metodologia está no §2 e é
reproduzível (anexo A).

## 1. Resumo executivo

| Indicador | Valor medido | Leitura |
|---|---|---|
| TTFB (todas as rotas) | **5–9 ms** | Servidor/estático ótimo — não é rede nem backend |
| DOM | 139 nós | Leve |
| CSS | 0,7 KB + Emotion runtime | Leve |
| Render-blocking | nenhum com economia apontada | OK |
| JS baixado por rota | **993–1.141 KB descomprimido** (485 KB transferidos na home) | Alto |
| Trabalho da main thread (home) | **10,6 s** com throttling mobile 4× | Alto |
| — do qual Script Evaluation | **7,9 s** | **Causa dominante** |
| TBT por rota | **4,4–6,0 s** (budget do gate: warn 2,5 s) | Muito alto |
| LCP por rota | **2,38–4,87 s** (erro do gate: 5,0 s) | /analise-avancada a 131 ms do corte |
| Score performance | 0,52–0,68 | Regressível com qualquer peso novo |

**Conclusão em uma frase:** a lentidão não é de rede nem de servidor — é
**execução de JavaScript na main thread**: ~1,0–1,14 MB de JS descomprimido
por rota (framework Next/React + MUI/Emotion + Dexie + engine estatístico +
seed de dados), avaliado e hidratado na carga inicial, seguido de cálculos
síncronos durante o uso. O JS "não usado" é de apenas 23 KiB — ou seja, o
problema não é código morto, é **código cedo demais**.

## 2. Metodologia (reproduzível)

1. Build de produção: `npm run build` (next 16.4.5, webpack, exigência do
   next-pwa) — 48,8 s no sandbox.
2. **Peso por rota**: scripts `<script src>` e `preload as=script` extraídos
   dos HTMLs pré-renderizados (`.next/server/app/*.html`) e somados em disco —
   é exatamente o que o browser baixa e executa.
3. **Lighthouse local**: `@lhci/cli@0.14` com Chromium headless (Playwright),
   throttling mobile padrão do Lighthouse, 2 runs × 4 rotas (as mesmas do gate
   do CI), relatórios salvos em disco e parseados.
4. **Identificação de chunks**: assinaturas de strings (identificadores que
   sobrevivem à minificação) por chunk; a atribuição do chunk 558 é hipótese
   (§8).
5. **Estrutura**: inventário completo de `src/` (117 arquivos, 20.312 linhas
   sem testes), imports, contexts, workers e efeitos.

## 3. Evidências

### 3.1 Lighthouse por rota (mediana de 2 runs, mobile throttled)

| Rota | perf | a11y | BP | FCP | LCP | TBT | SI | TTFB |
|---|---|---|---|---|---|---|---|---|
| / | 0,68 | 1,00 | 1,00 | 1.030 ms | **2.379 ms** | **5.974 ms** | 1.411 ms | 9 ms |
| /analise-avancada | 0,52 | 1,00 | 1,00 | 1.024 ms | **4.867 ms** | **4.709 ms** | 1.227 ms | 9 ms |
| /backtesting | 0,56 | 1,00 | 1,00 | 1.036 ms | **4.146 ms** | **4.410 ms** | 1.227 ms | 9 ms |
| /sobre | 0,61 | 1,00 | 1,00 | 825 ms | **3.443 ms** | **4.634 ms** | 1.231 ms | 5 ms |

FCP ~1 s e TTFB ~9 ms comprovam servidor e pintura inicial rápidos; o tempo
vai embora **entre FCP e LCP**, exatamente enquanto o JS principal executa.

### 3.2 JS baixado por rota (descomprimido, via HTML pré-renderizado)

| Rota | JS | Arquivos |
|---|---|---|
| / | **1.140,9 KB** | 18 |
| /analise-avancada | **1.113,5 KB** | 19 |
| /backtesting | **1.099,0 KB** | 18 |
| /privacidade | **1.019,2 KB** | 17 |
| /sobre | **993,5 KB** | 15 |

União entre rotas: **1.233 KB em 25 arquivos únicos** — 88% do JS é igual em
todas as rotas. Chunks presentes em **todas** as rotas (x5):

| Chunk | Tamanho | Identificação |
|---|---|---|
| 928-*.js | 246,1 KB | runtime do App Router + react-dom client |
| 4bd1b696-*.js | 199,3 KB | react-dom |
| framework-*.js | 185,6 KB | React + scheduler |
| 962-*.js | 168,7 KB | MUI + Emotion + i18next |
| 67-*.js | 120,1 KB | Dexie/IndexedDB (services de dados) |
| polyfills-*.js | 110,0 KB | core-js |
| 128-*.js | 67,9 KB | código do app (x3 rotas) |
| app/layout-*.js | 45,8 KB | layout/provedores globais |
| 470-*.js | 31,1 KB | código do app (tema/Emotion) |

Só essa base **onipresente ≈ 1.034 KB antes de qualquer código de página**.

### 3.3 Onde o tempo vai (home, bootup = 7.932 ms)

| Tempo | Script |
|---|---|
| **2.211 ms** | 928-*.js (App Router + react-dom) |
| **2.013 ms** | 860.*.js (**seed de dados da Quina, 253,8 KB** — carregado "pós-pintura", mas avalia cedo e caro) |
| **1.261 ms** | 67-*.js (Dexie/IndexedDB) |
| 1.169 ms | não atribuível (hidratação/runtime) |
| **1.130 ms** | 558.*.js (116 KB, código do app compartilhado) |
| 1.032 ms | scripts inline do HTML da home (RSC payload + styles Emotion SSR) |
| **850 ms** | **chunk de `/analise-avancada` avaliado durante a carga da HOME** |
| 293 ms | 4bd1b696 (react-dom) |

O item em negrito é a descoberta central: **dados (860) e engine (558) e até
JS de OUTRA rota** executam na carga inicial da home.

### 3.4 Custos secundários medidos

- **HTML por rota: 58–105 KB** (payload RSC inline + styles Emotion SSR) — a
  home gasta 1,03 s só para avaliar scripts inline.
- **Precache do service worker: 61 entradas / 2.041,5 KB**, incluindo
  **166,6 KB de PNGs de `public/store-assets/` que não são usados no app**
  (só Microsoft Store) — piora instalação/atualização do SW em toda visita.
- **polyfills 110 KB** (core-js completo do Next) para browsers modernos.
- **i18n pt-BR 28,1 KB** estático em toda rota (aceitável, citado por completude).
- Polling: `useHistorySummary` lê IndexedDB a cada 60 s; `PwaLifecycle`
  sincroniza a cada 30 min — custo baixo, mas contínuo em abas abertas.

## 4. Estrutura atual do código

| Aspecto | Estado medido |
|---|---|
| Escala | 117 arquivos / 20.312 linhas em `src/` (sem testes); `engine/` = 50 arq. / **12.432 linhas** |
| Renderização | **5/5 páginas `'use client'`** — zero Server Component de página; todo conteúdo é hidratado |
| Code-splitting | 1 único `next/dynamic` (EvidencePanel, PayoutSharePanel); 0 `React.lazy`; history JSONs corretamente em `import()` |
| Imports | MUI 100% deep (158 imports, 0 barrel); ícones deep (16 ícones); **0 libs pesadas** (lodash/moment/recharts/d3) |
| Estado global | 2 contexts; **`LotteryThemeContext` com `value` NÃO memoizado** envolve o app → trocar modalidade reconstrói o tema MUI inteiro (`createLotteryTheme`, 418 linhas) e re-renderiza tudo |
| Cálculo | Backtest usa **Web Worker** (bom, com gate `requestId`); benchmark 50 rodadas, walk-forward multi-corte, kelly e geração de jogos rodam **síncronos na main thread** com `setTimeout(0)` (a página admite "alguns segundos") |
| Memoização | `grep memoize` em `engine/` = **0 ocorrências**; `powerTable(lottery)` roda **a cada render** da analise-avancada (linha 133), não no clique |
| Fetch | `drawSources` usa AbortController (bom); `useNextDraw`/`caixaApi` não cancelam |

**Pontos fortes a preservar** (não regredir nas otimizações): worker de
backtest com gate; history em `import()`; consent LGPD com
`useSyncExternalStore` e value memoizado; Sentry 100% lazy (carrega via
`import()` pós-idle); acessibilidade 1,0 nas 4 rotas.

## 5. Causas-raiz priorizadas

| ID | Causa | Evidência (§) | Impacto |
|---|---|---|---|
| C1 | Hidratação 100% client (arquitetura RSC não utilizada) | 3.2, 4 | Base de todos os custos |
| C2 | Taxa de framework em toda rota (App Router + react-dom ≈ 631 KB descomprimido) | 3.2 | Piso de ~2,5 s de eval (throttled) |
| C3 | Engine estatístico (12.432 linhas) importado estaticamente pelas páginas | 3.3, 4 | Chunk 558 + partes do inline (≈ 1,1–2 s) |
| C4 | Seed de dados da Quina (253,8 KB) no bundle de runtime, avaliado cedo | 3.3 | **2,0 s** de eval na home |
| C5 | Dexie no bundle compartilhado de todas as rotas | 3.2/3.3 | 120 KB + **1,26 s** |
| C6 | JS de rotas vizinhas executado na origem (prefetch do router via BottomNav) | 3.3 | 850 ms na home |
| C7 | Contexto de tema não memoizado + rebuild completo do tema MUI por troca de modalidade | 4 | Travadas de UI em uso |
| C8 | Cálculos pesados síncronos na main thread (benchmark, walk-forward, kelly, geração) | 4 | UI congela segundos DEPOIS de carregada |
| C9 | Secundários: polyfills 110 KB; HTML 58–105 KB; precache +166,6 KB inúteis | 3.4 | Custos distribuídos |

## 6. Plano estrutural proposto

### Síntese (P0 = maior retorno, sem mudança de comportamento; P1 = decisão de UX pequena; P2 = polimento)

| # | Proposta | Alvos concretos | Efeito esperado | Esforço | Risco |
|---|---|---|---|---|---|
| P0-1 | Engine sob demanda na home (`dynamic()` nos gatilhos) | `page.tsx:29-36` (closureDesigner, gameGenerator, batchOdds, bayesEvidence, …) | Tira 558/860 do caminho crítico: **−350 a 450 KB e −2 a 3 s de eval inicial na home** | M | baixo |
| P0-2 | Dexie lazy (`import()` dentro dos services) | `services/db.ts`, `localData.ts`, `historySync.ts` | **−120 KB e −1,26 s em TODAS as rotas** | M | médio (dados) |
| P0-3 | Memoizar tema: `useMemo` no value + cache `Map<lottery, theme>` em `createLotteryTheme` | `context/LotteryThemeContext.tsx:30`, `theme.ts` | Elimina rebuild do tema e re-renders globais por troca de modalidade | P | baixo |
| P0-4 | `/sobre` e `/privacidade` como Server Components | `app/sobre/page.tsx`, `app/privacidade/page.tsx` (336 linhas de estático client hoje) | Nessas rotas o JS cai de ~1,0 MB para a taxa de framework + shell de navegação | M | médio (i18n) |
| P1-5 | Prefetch seletivo (`prefetch={false}` nas rotas pesadas do BottomNav) | `components/BottomNav.tsx` | Remove os 850 ms de eval cross-route na home | P | baixo |
| P1-6 | Worker para benchmark/walk-forward/kelly + `useMemo` em `powerTable` | `app/analise-avancada/page.tsx:133,189,306` (reusar `useBacktestWorker`/`workerGate`) | Fim das travadas de UI em uso (C7/C8) | M | médio |
| P1-7 | Precache enxuto: `globIgnores` para `/store-assets/**` | `next.config.ts` (workboxOptions) | −166,6 KB de precache em toda instalação | P | baixo |
| P1-8 | Painéis secundários da analise-avancada com `dynamic()` + skeleton | `analise-avancada/page.tsx` | Menos eval antes do LCP (hoje 4,87 s, a 131 ms do corte do gate) | P | baixo |
| P2-9 | `browserslist` moderno para encolher polyfills | `package.json` | Parte dos 110 KB (medir antes/depois) | P | baixo |
| P2-10 | Budgets novos no gate: assertion de KB de script (ex.: warn > 400 KB transfer) + script de auditoria de bundle | `lighthouse-gate.yml`, novo `web/scripts/bundle-audit.mjs` | Impede regressão estrutural silenciosa | P | baixo |
| P2-11 | Avaliar Dexie → Cache Storage/wrapper fino | `services/db.ts` | −120 KB permanentes | G | alto (só com testes de dados) |
| P2-12 | Turbopack quando o next-pwa/Workbox suportar | `package.json` | Tempo de build, não runtime | — | — |

### Efeito consolidado esperado (ESTIMATIVA a validar implementando)

| Métrica | Hoje | Após P0 | Após P0+P1 |
|---|---|---|---|
| JS inicial da home (descomprimido) | 1.141 KB | ~0,55–0,70 MB | ~0,55–0,70 MB |
| TBT home (throttled) | 5.974 ms | **~2,5–3,5 s** | ~2,0–3,0 s |
| LCP analise-avancada | 4.867 ms | ~3,5–4,0 s | **< 3,5 s** |
| JS nas rotas estáticas | ~1,0 MB | ~0,45 MB | idem |
| Travadas de UI em uso | segundos | idem | eliminadas (worker) |

Estimativas derivadas diretamente dos tempos medidos por chunk (§3.3): o que
sai do caminho crítico leva junto seu tempo de eval; a variância do runner
exige validação com o gate (5 runs, mediana).

### Ordem de execução recomendada

Um PR por proposta, nesta ordem: **P0-3** (trivial, isola a correção do
contexto) → **P0-1** → **P0-2** → **P1-5** → **P0-4** → **P1-6** → **P1-7** →
**P1-8** → P2. Cada PR mede antes/depois com o gate de Lighthouse e o
bundle-audit do anexo A; o gate do CI (a11y 1,0 hard; LCP erro 5 s) é o
guardrail contra regressão.

## 7. Riscos e guardrails

- **Acessibilidade**: a11y 1,0 é erro hard no gate — skeletons/SSR não podem
  regredir semântica/contraste; o gate detecta.
- **PWA offline**: chunks dinâmicos continuam no precache (Workbox pré-cacheia
  todos os assets do build) — offline se mantém; conferir `sw.js` após cada
  mudança (comando no anexo).
- **LGPD**: nenhuma proposta adiciona terceiros ou transferência de dados.
- **Dados (Dexie lazy / P0-2)**: é a proposta com mais risco — os testes
  existentes (788) e os fixtures golden cobrem os services; manter a API dos
  services intacta.

## 8. Limitações desta medição

- Sandbox de auditoria compartilhado: valores absolutos variam entre máquinas;
  as razões e a ordem dos custos são estáveis (o gate usa 5 runs/mediana por
  isso). As medianas oficiais do CI (3,67/3,54/4,03/2,72 s de LCP) batem com
  as faixas medidas aqui.
- 2 runs por rota (diagnóstico rápido), não 5 (padrão do gate).
- A atribuição interna dos chunks minificados usa assinaturas de strings; o
  chunk 558 (116 KB) não tem strings distintivas — classificá-lo como "código
  do app compartilhado" é hipótese com evidência indireta (posição no grafo de
  import e ausência de assinaturas de libs).
- O mecanismo exato do eval cross-route (850 ms) não foi traçado a nível de
  router; a mitigação proposta (P1-5) é barata e independente do mecanismo.

## Anexo A — reproduzir as medições

```bash
# 1) Build de produção
cd web && npm run build          # next build --webpack + strip-pwa-maps

# 2) JS por rota + precache (scripts de auditoria desta sessão)
python3 scripts-auditoria/bundle_audit.py       # lê .next/server/app/*.html e sw.js
python3 scripts-auditoria/chunk_signature.py    # assinaturas por chunk

# 3) Lighthouse local (mesmas rotas do gate)
npx next start -p 3000 &         # aguardar "Ready"
CHROME_PATH=<chromium> npx --yes @lhci/cli@0.14 autorun --config=lighthouserc-diagnostico.json
# lighthouserc-diagnostico.json: coleta das 4 rotas, numberOfRuns 2, upload filesystem

# 4) Precache do SW (entradas e KB em disco)
rg -o '"url"\s*:\s*"[^"]+"' public/sw.js | wc -l
```

Os scripts `bundle_audit.py`, `chunk_signature.py` e `lh_parse.py` usados
nesta auditoria estão documentados na sessão de worklog correspondente
(fora do repositório) e podem ser promovidos a `web/scripts/` na proposta
P2-10 (portados para Node).
