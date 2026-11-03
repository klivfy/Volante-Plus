---

description: "Task list for feature 003 — modalidade Quina"
---

# Tasks: Modalidade Quina com o mesmo protocolo de backtesting

**Input**: Design documents from `/specs/003-quina-lottery/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/quina-official-rules.md, contracts/history-seed.md, contracts/cross-platform-parity.md, quickstart.md

**Tests**: Incluídos — não são opcionais nesta feature. A Constituição (Princípio III, NÃO NEGOCIÁVEL) exige controles negativo e positivo, a spec exige verificação automatizada (FR-008) e SC-005 só é demonstrável por teste dourado.

**Organization**: Tarefas agrupadas pelas 4 histórias de `spec.md` em ordem de prioridade (US1 P1 → US2 P2 → US3 P3 → US4 P3). Antes delas, **Setup** (referência dourada e pré-registro) e **Foundational** (parametrizar o que hoje é "6 dezenas" sem mudar nenhuma saída de Mega-Sena/+Milionária e gerar o histórico da Quina).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência entre si)
- **[Story]**: A qual história a tarefa pertence (US1…US4). Setup, Foundational e Polish não têm rótulo.

## Path Conventions

Monorepo existente; caminhos reais conforme `plan.md` → Project Structure. `KT` = `shared/src/commonMain/kotlin/com/volanteplus/loterias`, `APP` = `app/src/main/java/com/volanteplus/loterias`, `KTEST` = `app/src/test/java/com/volanteplus/loterias`, `DESK` = `desktop/src/main/kotlin/com/volanteplus/desktop`.

## Restrições do ambiente de desenvolvimento remoto

Este ambiente **não resolve o plugin do Android** (`./gradlew` falha ao baixar o AGP). Toda tarefa Kotlin é validada pelo CI do GitHub (`./gradlew :app:testDebugUnitTest`); a web roda local (`cd web && npm test`). Onde um valor Kotlin precisa ser *capturado* de código existente (T002), a captura é feita pelo CI.

---

## Phase 1: Setup — referência e pré-registro (ANTES de qualquer mudança de código)

**Purpose**: Fixar o que não pode mudar (SC-005) e os critérios que não podem ser ajustados depois de ver o dado (Princípio II).

**⚠️ CRITICAL**: T001–T004 devem ser **mesclados em `main` antes** de T005 em diante.

- [ ] T001 Capturar o **teste dourado TypeScript** das duas modalidades existentes em `web/src/engine/__tests__/legacyModalitiesGolden.test.ts` com o snapshot em `web/src/engine/__tests__/golden/legacy-modalities.json` (gerado pelo próprio teste na primeira execução, `toMatchFileSnapshot`): para `Lottery.MEGA_SENA` e `Lottery.MAIS_MILIONARIA`, com semente fixa e o histórico de `web/src/data/history`, registrar (a) `runBacktest`/`analyzeBacktest` com uma data de corte fixa, (b) distribuição hipergeométrica e probabilidade de cada faixa de `prizeTiers`, (c) custo e garantias de `designClosure` para pool de 10 dezenas (terno e quadra), (d) um lote de `generateGames` com `createSeededRandom(semente)` (`web/src/engine/random.ts`). Rodar sobre o código **atual** e commitar o snapshot.
- [ ] T002 [P] Capturar o **teste dourado Kotlin** em `KTEST/domain/LegacyModalitiesGoldenTest.kt`: para `Lottery.MEGA_SENA` e `Lottery.MAIS_MILIONARIA`, com `kotlin.random.Random(semente fixa)`, computar `Hypergeometric.distributionFor`, `PrizeTable.tiers` (probabilidade e `Payout` de cada faixa), `PrizeTable.expectedReturn`, `AccumulatedReturn` (custo de cobertura total), um `BacktestEngine` com corte fixo sobre o CSV `app/src/main/assets/seed/*.csv`, e `ClosureDesigner.design(10, ...)` terno/quadra; **imprimir** cada valor em stdout com `println("GOLDEN <chave>=<valor com 15 dígitos>")` e só afirmar que são finitos. Mesclar em `main`, ler os valores no log do CI (`mcp__github__get_job_logs`) e anotá-los em T003.
- [ ] T003 Fixar o dourado Kotlin: em `KTEST/domain/LegacyModalitiesGoldenTest.kt`, trocar os `println` de T002 por `assertEquals(valorCapturado, calculado, 1e-12)` com os valores lidos do CI em T002 (copiados literalmente no teste). Depende de T002 mesclado.
- [ ] T004 [P] **Pré-registrar** os critérios dos controles da Quina (Princípio II) em `specs/003-quina-lottery/contracts/quina-preregistration.md`. `web/src/engine/audit/preregistration.ts` **já** fixa os critérios como constantes globais (`ALPHA = 0.05`, `BASELINE_HISTORIES = 10_000`, `BASELINE_SEED`, `POWER_REPLICATIONS = 2_000`, `POWER_SEED`, `TARGET_POWER = 0.8`, `ALTERNATIVE_RELATIVE_BIAS = 0.2`, `ALTERNATIVE_SUM_SHIFT_SD`) e deriva o resto das regras da modalidade (`expectedRepetition = K²/N`, `expectedSum = K(N+1)/2`, `sumVariance = K(N+1)(N−K)/12`); portanto a Quina **não** ganha critério novo nem altera `PREREGISTRATION_VERSION = '1.0.0'`. O documento registra, com a data do commit, (a) que nenhuma constante muda, (b) os valores derivados esperados para K=5, N=80 calculados à mão: repetição esperada 25/80 = 0,3125; soma esperada 5·81/2 = 202,5; variância da soma 5·81·75/12 = 2531,25 (desvio-padrão ≈ 50,31), e (c) o desenho dos controles de US3 (controle negativo: histórico i.i.d. de 5 de 1–80; controle positivo: viés de `ALTERNATIVE_RELATIVE_BIAS`). Commitar **antes** de T019 (que traz o histórico real). Em T023 o enum entra no código e T045 prova que a derivação reproduz esses números — um valor copiado errado seria invisível, uma fórmula errada quebra o teste. O mesmo documento é a referência dos controles Kotlin (US3).

**Checkpoint**: T001–T004 mesclados. A partir daqui, qualquer divergência nos dourados é regressão.

---

## Phase 2: Foundational — parametrizar por modalidade e gerar o histórico (sem mudar saídas)

**Purpose**: Tirar o "6 dezenas", o preço único e a fração de prêmio única de onde estão fixos, e produzir o histórico da Quina. Nada aqui altera um número de Mega-Sena/+Milionária; **os dois dourados continuam verdes ao fim desta fase**.

**⚠️ CRITICAL**: Nenhuma história começa antes desta fase.

### Domínio Kotlin (sem QUINA ainda)

- [ ] T005 Em `KT/domain/model/Lottery.kt` acrescentar o campo `numbersDrawn: Int` ao enum (`MEGA_SENA` = 6, `MAIS_MILIONARIA` = 6) e em `KT/domain/model/Draw.kt` trocar `require(numbers.size == NUMBERS_DRAWN)` (linhas ~19–20) por `lottery.numbersDrawn`, removendo `const val NUMBERS_DRAWN` (linha ~43) e atualizando o KDoc (linha ~7). Ajustar os usos em `KTEST/domain/backtest/AcceptanceCriteriaTest.kt:45` e `KTEST/domain/model/DrawTest.kt`.
- [ ] T006 Em `KT/domain/backtest/Hypergeometric.kt` (linhas ~62, 66, 70) e `KT/domain/backtest/BacktestAnalyzer.kt` (linha ~44, `sampleSize`) trocar `Draw.NUMBERS_DRAWN`/`GameGenerator.GAME_SIZE` por `lottery.numbersDrawn` (K e n da aposta simples). Depende de T005.
- [ ] T007 Em `KT/domain/generator/GameGenerator.kt` (linhas ~117, 203–204, 328) trocar `GAME_SIZE = Draw.NUMBERS_DRAWN` por `lottery.numbersDrawn` (a função de montagem de jogo já recebe `lottery`); em `KT/domain/backtest/PayoutShare.kt` (linha ~273, `private const val GAME_SIZE = 6`, usado em `PopularityReference.build` linhas ~258–267) e em `KT/domain/backtest/AccumulatedReturn.kt` (linha ~84, `binomial(numberRange.count(), 6)`) usar `lottery.numbersDrawn`. Depende de T005.
- [ ] T008 Em `KT/domain/backtest/PrizeTable.kt` tornar **por modalidade** o preço (hoje `SIMPLE_BET_PRICE = 6.0` e `betPrice(lottery)` que ignora o parâmetro, linhas ~192–194) e a fração de prêmio bruto (`PRIZE_SHARE_OF_COLLECTION = 0.4335`, linha ~21), mantendo **exatamente** `6.0` e `0.4335` para `MEGA_SENA` e `MAIS_MILIONARIA`; `ClosureDesign.totalCost` (`KT/domain/generator/ClosureDesigner.kt`, linha ~34) passa a receber a modalidade para usar `PrizeTable.betPrice(lottery)` em vez de `SIMPLE_BET_PRICE`. Depende de T005.
- [ ] T009 [P] Em `KT/domain/generator/Unpopularity.kt` (linha ~64, `VOLANTE_COLUMNS = 10`) tornar o número de colunas do volante uma função da modalidade (10 para Mega-Sena e +Milionária, valor atual); `BIRTHDAY_MAX = 31` e `MONTH_MAX = 12` ficam como estão.

### Domínio TypeScript (sem QUINA ainda)

- [ ] T010 [P] Em `web/src/engine/payoutShare.ts` (linha ~126, `const GAME_SIZE = 6`, usado em ~136–140) usar `lotteryRules(lottery).numbersPerBet`.
- [ ] T011 Em `web/src/engine/prizeRules.ts` acrescentar `betPriceBrl: number` a `LotteryRules` (6 para `MEGA_SENA` e `MAIS_MILIONARIA`, valor atual) e `volanteColumns: number` (10 para ambas); em `web/src/engine/closureDesigner.ts` trocar `SIMPLE_BET_PRICE_BRL` (linha ~36; usos ~305 e ~341) por `lotteryRules(lottery).betPriceBrl` e dar a `closureCost(gamesCount)` (linha ~304; chamada em ~361 e em `web/src/app/page.tsx:29,334`) o parâmetro `lottery`, mantendo o resultado atual (6,00 por jogo) para as duas modalidades; em `web/src/engine/unpopularity.ts` (linha ~64, `VOLANTE_COLUMNS = 10`) ler `volanteColumns` da modalidade. Atualizar `web/src/engine/__tests__/closureDesigner.test.ts` (linhas ~65 e ~101) e `unpopularity.test.ts`.
- [ ] T012 [P] Eliminar listas e ramos que dariam resposta errada **em silêncio** para uma 3ª modalidade: derivar `ALL_LOTTERIES` de `Object.values(Lottery)` em `web/src/services/syncService.ts` (linha ~34) e `web/src/services/db.ts` (linha ~40) e `extension/src/sync.ts` (linha ~10); em `web/src/data/history/index.ts` (`loadHistorySeed`, linhas ~50–58) e `web/src/data/syntheticFixture/index.ts` (linhas ~14–23) trocar `default: []` por erro explícito para modalidade sem dado.
- [ ] T013 [P] Em `web/src/app/analise-avancada/page.tsx` (linhas ~417–434) substituir os ternários `Lottery.MEGA_SENA ? … : …` (chaves de faixa `'6'/'5'/'4'` vs `'6+2'/…`, prêmios médios `50000/30000`, `1000/800`, custo padrão `'5'`) por valores derivados de `prizeTiers(lottery)`/`lotteryRules(lottery).betPriceBrl`, **extraindo a lógica para uma função pura** em `web/src/engine/` com teste que prove os mesmos valores atuais para as duas modalidades.
- [ ] T014 [P] Em `web/src/engine/__tests__/fixtures.ts` (linhas ~17–18, `universe = MEGA ? 60 : 50; hasTrevos = MAIS`) e `web/src/engine/audit/__tests__/provenance.test.ts` (ternários 60/50 nas linhas ~15, 32, 53–54, 78, 122, 127, 165) usar `lotteryRules(lottery)`.

### Verificação dos dourados

- [ ] T015 Rodar `cd web && npm test` e confirmar que `legacyModalitiesGolden.test.ts` (T001) e toda a suíte existente continuam verdes sem editar o snapshot; abrir o PR e confirmar no CI que `LegacyModalitiesGoldenTest` (T003) e `:app:testDebugUnitTest` seguem verdes. **Qualquer diferença é regressão: corrigir o código, nunca o dourado.**

### Histórico da Quina (fonte única)

- [ ] T016 Em `web/scripts/update-history-seed.mjs` acrescentar `RULES.quina = { key: 'quina', drawn: 5, universe: 80, trevoDrawn: 0, trevoUniverse: 0, mirror: 'quina.json' }`; carregar o espelho de cada modalidade só quando ela for processada (hoje a linha ~67 lê o arquivo incondicionalmente); comparar **também as datas** quando o espelho tiver datas reais (campo `datesReal` no espelho; o espelho antigo continua só comparando dezenas); gravar tuplas de 3 elementos para a Quina (sem 4º elemento); manter o aborto sem gravar nada em qualquer falha (`contracts/history-seed.md`, obrigação 1).
- [ ] T017 Em `web/scripts/update-history-seed.mjs` acrescentar o modo `--collect-mirror quina` que baixa `https://servicebus2.caixa.gov.br/portaldeloterias/api/quina/{n}` de 1 ao último concurso (4 requisições em paralelo, retomável a partir do que já foi baixado, falha clara em HTTP ≠ 200), reduz cada resposta a `{contestNumber, date, numbers}` (`listaDezenas` como inteiros ordenados; `dataApuracao` dd/MM/yyyy → ISO) e grava `web/src/data/mirrorSnapshot/quina.json` com `datesReal: true`.
- [ ] T018 Rodar `node web/scripts/update-history-seed.mjs --collect-mirror quina` (rede; ~10 min) e atualizar `web/src/data/mirrorSnapshot/README.md` com a origem da Quina: portal da Caixa (endpoint por concurso), data da coleta, `datesReal`, e a ressalva de que **não** é exportação oficial direta (Princípio IV). Depende de T016, T017.
- [ ] T019 Rodar `node web/scripts/update-history-seed.mjs` (rede) para gerar `web/src/data/history/quina.json` e a entrada `lotteries.quina` em `web/src/data/history/meta.json`. Esperado hoje: `count = lastContest = 7149`, `firstContest = 1`, `lastDate = 2026-10-22`, `crossChecked = 7149`; **se divergir de 7149, parar e investigar** antes de seguir. Depende de T004 mesclado (pré-registro) e T018.
- [ ] T020 [P] Atualizar `web/src/data/history/README.md` (citar `quina.json` com tuplas de 3 elementos) e `web/src/data/history/__tests__/historySeed.test.ts` (linhas ~9–10, 31, 45: pares espelho/seed e a asserção da string de versão) para a Quina — o teste lê `meta.json` e confere contagem, contiguidade, 5 dezenas distintas em 1–80 e ausência de trevo. Depende de T019.

**Checkpoint**: Dourados verdes; `quina.json` + `mirrorSnapshot/quina.json` + `meta.json` commitados. Histórias podem começar.

---

## Phase 3: User Story 1 — Backtesting da Quina sobre o histórico completo (Priority: P1) 🎯 MVP

**Goal**: Escolher a Quina nas três plataformas e gerar o relatório de backtesting sobre o histórico do concurso 1 ao último do seed, sem rede, sem alterar Mega-Sena/+Milionária.

**Independent Test**: instalação nova, sem rede, escolher Quina, definir corte e gerar o relatório; histórico de 1 ao último concurso do seed, distribuição de acertos de 0 a 5 (spec US1; `quickstart.md` passos 3–5).

### Tests for User Story 1

- [ ] T021 [P] [US1] Teste de paridade e oráculos da Quina em `web/src/engine/__tests__/quinaOfficialRules.test.ts`: para n = 5..15, a probabilidade de "exatamente f acertos" de `hypergeometric` (K=5, N=80) é igual a `C(5,f)·C(75,n−f)/C(80,n)` até 1e-12, e `|1/chance − oficial| ≤ 1` contra a **tabela de `contracts/quina-official-rules.md` (Verificação 2)**, copiada literalmente; chance de quina da aposta simples = `1/24040016`; `C(n,5)·betPriceBrl` = 3, 18, 63, 168, 378, 756, 1386, 2376, 3861, 6006, 9009 para n = 5..15. Escrever **antes** de T023 (deve falhar).
- [ ] T022 [P] [US1] Teste de seed corrompido da Quina em `web/src/data/history/__tests__/quinaSeedIntegrity.test.ts` (controles positivos, Princípio III): lacuna na sequência, dezena 81, 6 dezenas num concurso e trevo presente **devem** ser rejeitados pelo validador do script (extrair `validateDraws(rule, draws)` de `web/scripts/update-history-seed.mjs` para reuso no teste) e o seed real deve passar.

### Implementation for User Story 1 — web

- [ ] T023 [US1] Em `web/src/types/domain.ts` acrescentar `QUINA = 'quina'` a `Lottery` e corrigir os comentários desatualizados (linhas ~40 e ~62: "1..60 ou 1..50", "6 números + 2 trevos"); em `web/src/engine/prizeRules.ts` acrescentar `QUINA_TIERS` (chaves `'5'`, `'4'`, `'3'`, `'2'`; rótulos Quina, Quadra, Terno, Duque) e a entrada em `RULES`: `numberUniverse: 80, numbersDrawn: 5, numbersPerBet: 5, trevoUniverse: 0, trevosDrawn: 0, trevosPerBet: 0, minSelection: 5, maxSelection: 15, betPriceBrl: 3, volanteColumns: 8`. Faz T021 passar.
- [ ] T024 [P] [US1] `web/src/engine/backtestEngine.ts` (linhas ~33–36): `MIN_CUTOFF_DATES[Lottery.QUINA] = '1994-03-13'`; `web/src/services/caixaApi.ts` (linhas ~9–12): `API_PATH` com `quina: 'quina'`.
- [ ] T025 [US1] Em `web/src/data/history/index.ts`: `HISTORY_SEED_META` (linhas ~26–29) com a Quina, novo `case Lottery.QUINA` com `import('./quina.json')` dinâmico em `loadHistorySeed` (linhas ~50–58) e `historySeedVersion()` (linhas ~32–34) passando a incluir o último concurso da Quina, para que quem já tem o app receba a Quina uma vez (sem sobrescrever concursos sincronizados). Depende de T019, T023.
- [ ] T026 [P] [US1] Em `web/src/engine/audit/mirrorSource.ts` (linhas ~15–22) carregar o snapshot da Quina por `import()` dinâmico (não estático — evita pôr 500 KB em todo chunk que usa a auditoria) e fazer `sourceLabel` (linhas ~27–30) descrever a origem correta da Quina (portal da Caixa), não o commit do `guilhermeasn/loteria.json`; criar a fixture sintética da Quina (`web/src/data/syntheticFixture/quina.json`, 50 concursos de PRNG com 5 dezenas em 1–80, e o `case` em `web/src/data/syntheticFixture/index.ts`) para a guarda de procedência. Depende de T018, T023.
- [ ] T027 [P] [US1] `web/src/theme.ts` (linhas ~44–53): paleta da Quina em `BRAND` (violeta, ~`#260085` / escuro ~`#B39DFF`, ajustar até passar) e `web/src/__tests__/themeAccessibility.test.ts` cobrindo-a com o mesmo limiar de contraste WCAG das outras; `web/locales/pt-BR/common.json` (linhas ~9–10): `lottery.quina`; `web/src/components/LotterySelector.tsx` (linhas ~21–25): terceira opção, conferindo o layout em largura estreita. Antes de tocar nesta UI, ler o guia relevante em `web/node_modules/next/dist/docs/` (Princípio VI, `web/AGENTS.md`).
- [ ] T028 [P] [US1] Adicionar a Quina em `web/src/engine/__tests__/modalityParity.test.ts` (`LOTTERIES`, linha ~23; as asserções de trevo ficam para as modalidades com trevo) e testes de backtest da Quina em `web/src/engine/__tests__/backtestEngine.test.ts` (histórico simulado de 5 dezenas em 1–80; corte sem vazamento do futuro; distribuição de acertos 0..5); `web/e2e/flow.spec.ts`: alternar para "Quina", rodar o backtesting e ver o relatório.

### Implementation for User Story 1 — Kotlin (Android + desktop)

- [ ] T029 [US1] Em `KT/domain/model/Lottery.kt` acrescentar `QUINA(displayName = "Quina", numberRange = 1..80, minSelection = 5, maxSelection = 15, hasTrevos = false, numbersDrawn = 5)` **como último valor do enum** (a UI usa `ordinal` como índice de aba: `APP/ui/volante/VolanteScreen.kt:156-166`, `APP/ui/backtest/BacktestScreen.kt:94-95`, `DESK/ui/backtest/BacktestScreen.kt:88-89`, `DESK/ui/volante/VolanteScreen.kt:118-119`); em `KT/data/remote/CaixaLotteryApi.kt` (linhas ~122–126) `Lottery.QUINA -> "quina"`; em `APP/data/seed/AssetDrawSeeder.kt` (linhas ~31–34) `Lottery.QUINA -> "seed/quina.csv"`.
- [ ] T030 [US1] Em `KT/domain/backtest/PrizeRules.kt` (linhas ~56–83) ramo `QUINA`: `isPrize` = `numberHits >= 2`; `tierIndex` 5→1, 4→2, 3→3, 2→4; `tierCount` = 4. Em `KT/domain/backtest/PrizeTable.kt`: preço `3.0` e fração de prêmio bruto `0.4379` **só para QUINA**; `tiers(QUINA)` com 4 faixas ("Quina (5 acertos)", "Quadra (4 acertos)", "Terno (3 acertos)", "Duque (2 acertos)") e `Payout.Share(0.35 / 0.15 / 0.10 / 0.10)`; `shareBase(QUINA) = ShareBase.GROSS_PRIZE`; `reserveShare(QUINA) = 0.0` (os 30% restantes não entram nas faixas do concurso comum — `contracts/quina-official-rules.md`). **Conferir antes o regulamento oficial da Quina** (circular da Caixa) quanto à destinação dos 30% e registrar a data da conferência em `REFERENCE_DATE`; se divergir, corrigir `contracts/quina-official-rules.md` na mesma mudança. Depende de T029, T008.
- [ ] T031 [US1] Em `scripts/generate-android-seed.mjs` acrescentar `RULES.quina = { key: 'quina', file: 'quina.csv', drawn: 5, universe: 80, trevoDrawn: 0, trevoUniverse: 0 }` (as três modalidades continuam validadas **antes** de gravar qualquer arquivo) e rodar `node scripts/generate-android-seed.mjs` para gerar `app/src/main/assets/seed/quina.csv` (esperado: 7150 linhas, cabeçalho + 7149 concursos, coluna de trevos vazia). Atualizar `app/src/main/assets/seed/README.md`. Depende de T019.
- [ ] T032 [US1] Testes Kotlin da Quina (CI): em `KTEST/data/seed/SeedHistoryIntegrityTest.kt` os quatro testes equivalentes para `quina.csv` (parseia sem erro, contíguo de 1 ao último, contagem e último concurso batendo com `web/src/data/history/meta.json` → `lotteries.quina`) **mais controles positivos** (dezena 81 rejeitada; lacuna detectada; 6 dezenas rejeitadas por `Draw`; trevo presente rejeitado); em `KTEST/domain/model/DrawTest.kt` concurso válido da Quina (5 dezenas) e inválido (6); em `KTEST/domain/backtest/PrizeRulesTest.kt`, `PrizeTableTest.kt` (loops por `Lottery.entries` já cobrem a Quina: retorno esperado estritamente negativo; soma de probabilidades; conservação), `HypergeometricTest.kt` (oráculo combinatório e a tabela oficial, mesmos valores de T021), `BacktestEngineTest.kt` (histórico de 5 dezenas), `CsvDrawParserTest.kt`; `app/src/androidTest/.../data/local/DrawDaoTest.kt`: ida e volta de `QUINA` no Room. Depende de T029–T031.
- [ ] T033 [P] [US1] Telas: `APP/ui/backtest/BacktestScreen.kt` (linha ~432) e `DESK/ui/backtest/BacktestScreen.kt` (linha ~319) trocar `(0..6)` por `0..lottery.numbersDrawn` nas linhas de distribuição de acertos; `APP/res/values/strings.xml` (linha ~4) e `web/locales/pt-BR/common.json` (linha ~82) atualizar o slogan "Gerador estatístico para Mega-Sena e +Milionária" para incluir a Quina **sem adjetivo novo** (Princípio I).
- [ ] T034 [US1] Medir SC-007: no teste de backtest da web (`backtestEngine.test.ts`) e no `BacktestEngineTest.kt`, registrar o tempo do backtest da Quina (7.149 concursos) e da Mega-Sena (3.063) com a janela de validação padrão; a Quina não pode passar de ~3× o tempo da Mega-Sena (proporcional ao histórico). Se passar, investigar antes de seguir.

**Checkpoint**: US1 funcional e testável sozinha nas três plataformas (MVP). Rodar `quickstart.md` passos 3–5.

---

## Phase 4: User Story 2 — Gerar jogos da Quina pelas regras do volante (Priority: P2)

**Goal**: Volante de 5 a 15 dezenas em 1–80, faixas/chances corretas e fechamento com contrato honesto.

**Independent Test**: marcar menos de 5 e mais de 15 (recusado), 5 e 15 (aceito), gerar lote sem repetição em cada jogo e conferir chances à mão (spec US2).

### Tests for User Story 2

- [ ] T035 [P] [US2] Em `web/src/engine/__tests__/gameGenerator.test.ts` e `closureDesigner.test.ts` casos da Quina: jogos com 5 dezenas distintas em 1–80; lote respeita a estratégia; `designClosure` com `gameSize = 5`, v = 6..15, t ∈ {3, 4}: cobertura **verificada por enumeração exaustiva** (todo t-subconjunto contido em algum jogo) e custo = `jogos × 3,00` (não × 6,00). Escrever antes de T038 (deve falhar onde falta).
- [ ] T036 [P] [US2] Em `KTEST/domain/generator/GameGeneratorTest.kt`, `ClosureDesignerTest.kt` (linhas ~112–113, 169 hoje presas a k=6) e `KTEST/ui/volante/VolanteViewModelTest.kt`: os mesmos casos de T035 em Kotlin; o ViewModel da Quina aceita 5 e 15 dezenas e recusa 4 e 16.

### Implementation for User Story 2

- [ ] T037 [US2] `scripts/generate-closure-tables.mjs` (novo): calcula C(v, 5, t) para v = 6..15 e t ∈ {3, 4} pelo algoritmo guloso determinístico já em `web/src/engine/closureDesigner.ts`, **verifica cada cobertura exaustivamente** e aborta sem gravar nada se alguma falhar; emite o mesmo dado em `web/src/engine/closureTables.ts` (acrescentar as chaves `"{v}:{t}"` para k=5 ao lado das de k=6) e em uma tabela Kotlin `KT/domain/generator/ClosureTablesK5.kt` (gerada, com cabeçalho "não edite à mão"). Imprime, por (v, t), o número de jogos e o limite de Schönheim.
- [ ] T038 [US2] Em `web/src/engine/closureDesigner.ts` (linha ~125, `gameSize === 6 ? CLOSURE_TABLES[...]`) escolher a tabela por `gameSize` (6 ou 5) e manter o caminho guloso para o que não estiver tabelado; `offeredGuarantees` (linha ~297) continua `[3, 4]` para a Quina (duque não é oferecido, como hoje). Depende de T037.
- [ ] T039 [US2] Em `KT/domain/generator/ClosureDesigner.kt` generalizar de k=6 para k = `lottery.numbersDrawn` (hoje `SUPPORTED_POOL_SIZES = 7..15` na linha ~73 e tabelas C(v,6,t) nas linhas ~175–222): pools de 6..15 para a Quina usando `ClosureTablesK5` e `verify()` exaustivo em tempo de execução; `ClosureGuarantee` (TERNO=3, QUADRA=4) vale para as duas; `ClosureDesign.contract` usa o preço da modalidade. **Fallback declarado** (`research.md` Decisão 5): se esta tarefa não fechar a tempo, manter a guarda de `APP/ui/volante/VolanteViewModel.kt:388-402` e `DESK/ui/volante/VolanteViewModel.kt:~179` recusando fechamento da Quina com a mensagem já usada para a +Milionária, e registrar o corte no PR. Depende de T037, T008.
- [ ] T040 [US2] Em `APP/ui/volante/VolanteViewModel.kt` (guarda do fechamento, linhas ~388–402, e a chamada `ClosureDesigner.design(numbers.size, …)` na linha ~96) e `DESK/ui/volante/VolanteViewModel.kt` (linha ~179) trocar a condição "recusa se `hasTrevos`" por "recusa se a modalidade não tem desenho de fechamento" (hoje só a +Milionária); a Quina passa a fechar. Depende de T039.
- [ ] T041 [P] [US2] Grade do volante por modalidade: `APP/ui/volante/VolanteScreen.kt` (`NUMBER_GRID_COLUMNS = 6`, linhas ~200 e ~951) e `DESK/ui/volante/VolanteScreen.kt` (linha ~495) passam a ler as colunas da modalidade (8 para a Quina; 6 para as outras, valor atual); o controle do pool de fechamento (`APP/…/VolanteScreen.kt` linhas ~661–662) respeita `SUPPORTED_POOL_SIZES` da modalidade; `web/src/components/NumberPicker.tsx` (comentário de 10 colunas, linhas ~19–20): conferir que 80 dezenas cabem em largura estreita.
- [ ] T042 [P] [US2] Heurística de baixa popularidade na Quina: `KT/domain/generator/Unpopularity.kt` e `web/src/engine/unpopularity.ts` usam 8 colunas para a Quina (`volanteColumns`), e o texto da estratégia na Quina é rotulado **hipótese não validada** (não há histórico brasileiro de rateio da Quina no repositório — `research.md` Decisão 6); testes em `KTEST/domain/generator/UnpopularityTest.kt` e `web/src/engine/__tests__/unpopularity.test.ts` para a geometria de 8 colunas.
- [ ] T043 [US2] Exibir chances e prêmios da Quina nas duas UIs: confirmar que as telas que listam faixas e chances (web: páginas que usam `prizeTiers`/`hypergeometric`; Android: `PrizeTable.tiers`) mostram as 4 faixas e "1 em 24.040.016" para a quina da aposta simples; ajustar texto/estrutura onde algo assumia 3 ou 10 faixas. Teste de UI/unidade que fixe o texto "24.040.016" para a Quina.
- [ ] T044 [US2] Casos 3 e 4 de `contracts/cross-platform-parity.md`: os mesmos vetores (`C(n,5)·3,00` para n = 5..15; v, t → número de jogos de fechamento) executados em `web/src/engine/__tests__/quinaOfficialRules.test.ts` e em `KTEST/domain/backtest/PrizeTableTest.kt` + `ClosureDesignerTest.kt`, com os valores copiados literalmente nos dois lados.

**Checkpoint**: US1 e US2 funcionam juntas; `quickstart.md` passo 3.

---

## Phase 5: User Story 3 — Instrumento validado por controles, sem alegação preditiva (Priority: P3)

**Goal**: O instrumento de backtesting passa pelos controles negativo e positivo na Quina e nada na UI/documentação a vende como preditiva.

**Independent Test**: controle negativo sem sinal além do falso positivo declarado; controle positivo detectado (spec US3).

### Tests for User Story 3

- [ ] T045 [P] [US3] Controle negativo da Quina em `web/src/engine/audit/__tests__/quinaControls.test.ts`: gerar históricos i.i.d. de Quina (5 de 1–80, tamanho do histórico real, com `ALPHA`, `BASELINE_HISTORIES` e `BASELINE_SEED` **importados de `preregistration.ts`**, sem constantes novas, conforme `contracts/quina-preregistration.md`, T004) e provar que `expectedRepetition`, `expectedSum` e `sumVariance` da Quina valem 0,3125, 202,5 e 2531,25 e afirmar que a taxa de falsos positivos de `anomalyTests`/`baseline` fica dentro da declarada.
- [ ] T046 [P] [US3] Controle positivo da Quina no mesmo arquivo: injetar um viés de tamanho conhecido (uma dezena com probabilidade elevada em `ALTERNATIVE_RELATIVE_BIAS`, com `POWER_REPLICATIONS` e `POWER_SEED` de `preregistration.ts`) e afirmar detecção em 100% das réplicas do teste (SC-004). Um instrumento que nunca acusa nada também passa no negativo — este teste é o que prova que o instrumento enxerga.
- [ ] T047 [P] [US3] Controles Kotlin em `KTEST/domain/backtest/AcceptanceCriteriaTest.kt` para `Lottery.QUINA`: backtest sobre histórico simulado i.i.d. não bate o baseline hipergeométrico além do esperado; com viés injetado, bate. Mesmos parâmetros de `contracts/quina-preregistration.md` (T004), copiados literalmente.

### Implementation for User Story 3

- [ ] T048 [US3] Auditoria sobre o histórico real da Quina **depois** do pré-registro (Princípio II): em `web/src/engine/audit/__tests__/realHistoryAudit.test.ts` e `realHistoryModuleB.test.ts` incluir a Quina com procedência `third_party_mirror`; o teste só verifica que o relatório sai com a ressalva de procedência em destaque antes de qualquer resultado e **não** afirma "sinal" — o resultado é reportado como obtido, sem ajustar critério. Depende de T004 e T019.
- [ ] T049 [US3] Varredura de alegações (Princípio I, FR-009): `rg -n -i "vantagem|melhor|garant|prev|acerta|quente|sorte" web/src web/locales app/src/main docs README.md` nas strings que mencionam a Quina; qualquer texto que sugira poder preditivo ou "números quentes" como fato vira hipótese sob teste ou é removido. Acrescentar teste em `web/src/__tests__/` que falha se as strings da Quina em `web/locales/pt-BR/common.json` contiverem as palavras proibidas definidas na própria lista do teste, e conferir que o aviso "o sorteio é aleatório; o backtesting não prevê resultados" aparece nas telas de backtest da Quina (web e Android) com o mesmo peso das outras modalidades.

**Checkpoint**: controles pré-registrados e verdes; varredura limpa.

---

## Phase 6: User Story 4 — Histórico sempre atualizado e igual nas plataformas (Priority: P3)

**Goal**: Atualizar o histórico da Quina em um passo repetível, de uma fonte só, e a sincronização incremental da Quina funcionando.

**Independent Test**: avançar o histórico de referência, regenerar, e ver web/Android/desktop com o mesmo intervalo e o relatório de contagens (spec US4; `quickstart.md` passos 1, 2, 7).

### Tests for User Story 4

- [ ] T050 [P] [US4] Sincronização incremental da Quina: em `web/src/services/__tests__/syncService.test.ts`, `caixaApi.test.ts`, `drawSources.test.ts` e `db.test.ts` casos para `Lottery.QUINA` (busca só o que falta; preenche lacunas antigas; descarta concurso inválido — 6 dezenas, dezena 81, número de concurso diferente do pedido; `purgeSyntheticFixture` não toca dado real); em `KTEST/domain/usecase/SyncDrawHistoryTest.kt`, `data/remote/CaixaDrawDtoTest.kt` e `domain/usecase/GetNextDrawInfoUseCaseTest.kt` o equivalente Kotlin com resposta da Quina de 5 dezenas.
- [ ] T051 [P] [US4] Fail-closed e determinismo do gerador do Android: teste de script (`node --test`, em `scripts/generate-android-seed.test.mjs`) que (a) com a Quina corrompida em um diretório temporário **nenhum** dos três CSVs é gravado e o código de saída é ≠ 0, (b) duas execuções produzem arquivos idênticos byte a byte. Parametrizar o diretório de entrada/saída por variável de ambiente para o teste, sem tocar nos arquivos reais.

### Implementation for User Story 4

- [ ] T052 [US4] Caso 7 de `contracts/cross-platform-parity.md`: teste que compara `web/src/data/history/quina.json`, `app/src/main/assets/seed/quina.csv` e `web/src/data/mirrorSnapshot/quina.json` (contagem, último concurso, primeiros e últimos 3 concursos, dezenas e datas) em `web/src/data/history/__tests__/quinaSeedParity.test.ts`; falha se os três divergirem.
- [ ] T053 [P] [US4] Extensão de navegador: `extension/popup-app/src/components/PopupContent.tsx` (linhas ~23–27 e ~46: mapa de rótulos e `LOTTERY_OPTIONS`) com a Quina; confirmar que `extension/manifests/*.manifest.json` (`host_permissions` só do host da API principal) **não** precisam mudar e que o pacote da extensão continua dentro do limite de tamanho com o `quina.json` incluído (registrar o tamanho antes/depois no PR).
- [ ] T054 [US4] Desktop (Decisão 9): `DESK/ui/backtest/BacktestScreen.kt` (linhas ~201–202) cita o CSV de exemplo; atualizar o texto para mencionar `quina.csv`; validar manualmente o passo 7 do `quickstart.md` (importar `quina.csv`, mesmo relatório do Android para o mesmo corte). `DESK/notification/NextDrawNotifier.kt` itera `Lottery.entries` e passa a consultar a Quina — conferir que a falha de uma modalidade não derruba as outras.

**Checkpoint**: todas as histórias funcionais.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Fechar a rastreabilidade documental e provar que nada regrediu.

- [ ] T055 [P] Atualizar `docs/historico.md` (contagens e regras de validação por modalidade, linhas ~6–8, 35, 52–68; seção sobre a Quina e a conferência contra o portal), `README.md` (Roadmap e descrição das modalidades), `docs/refinamento-estatistico.md`, `docs/metodos-estatisticos-adicionais.md`, `docs/MICROSOFT_STORE.md`, `web/src/engine/audit/README.md`, `web/src/data/syntheticFixture/README.md` e `CHANGELOG.md` (entrada "Não lançado": Quina) — no mesmo PR que muda o comportamento (Constituição, Fluxo de Desenvolvimento). Não bumpar versões: o bump é decisão de release.
- [ ] T056 Rodar `cd web && npm run lint && npm test && npm run build` e `npm run test:e2e`; confirmar no CI `:app:testDebugUnitTest` e `:desktop` verdes, **com os dois dourados (T001, T003) inalterados** — prova de SC-005 e FR-012.
- [ ] T057 Executar os passos 1–7 de `specs/003-quina-lottery/quickstart.md` de ponta a ponta. Os passos 5 (instalação nova offline no aparelho) e 6 (atualização sobre app já sincronizado, sem duplicar nem sobrescrever) exigem emulador/aparelho Android e **não podem ser feitos neste ambiente**: registrar como pendentes de validação humana, não como concluídos.
- [ ] T058 Marcar o item correspondente do Roadmap e fechar a spec: atualizar `specs/003-quina-lottery/checklists/requirements.md` (notas finais) com o que ficou fora (fechamento Kotlin se o fallback de T039 foi usado; passos manuais de T057).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T004)**: sem dependências entre si, exceto T003 depende de T002 mesclado (leitura do CI). **Todos mesclados em `main` antes de T005; T004 também antes de T019.**
- **Foundational (T005–T020)**: depende de Setup. Dentro dela:
  - Kotlin: T005 → (T006, T007, T008); T009 é independente.
  - TypeScript: T010–T014 independentes entre si, exceto T011 (mexe em `prizeRules.ts`/`closureDesigner.ts`/`unpopularity.ts`) antes de T013 se este usar `betPriceBrl`.
  - T015 (verificação dos dourados) depende de T005–T014.
  - Dados: T016 → T017 → T018 → T019 → T020; T019 também depende de T004.
- **US1 (T021–T034)**: depende de Foundational. Web (T023–T028) e Kotlin (T029–T033) são independentes entre si; T034 por último.
- **US2 (T035–T044)**: depende de Foundational e do enum da Quina (T023, T029). T037 antes de T038/T039; T039 antes de T040.
- **US3 (T045–T049)**: depende do enum (T023, T029) e do pré-registro (T004); T048 depende também do histórico (T019).
- **US4 (T050–T054)**: depende de US1 (enum, histórico, CSV).
- **Polish (T055–T058)**: depende das histórias desejadas.

### Dentro de cada história

Testes primeiro (devem falhar), depois implementação. Em Kotlin, "falhar" é verificado pelo CI.

### Parallel Opportunities

- Setup: T002 [P] e T004 [P] em paralelo a T001.
- Foundational: T009, T010, T012, T013, T014 [P] em arquivos distintos; web (T010–T014) em paralelo ao Kotlin (T005–T009).
- US1: T021/T022 [P]; T024, T026, T027, T028 [P] (arquivos distintos); web e Kotlin em paralelo.
- US2: T035/T036 [P]; T041, T042 [P].
- US3: T045, T046, T047 [P].
- US4: T050, T051, T053 [P].

### Parallel Example: User Story 1

```text
Task: "T021 oráculos da Quina em web/src/engine/__tests__/quinaOfficialRules.test.ts"
Task: "T022 seed corrompido em web/src/data/history/__tests__/quinaSeedIntegrity.test.ts"
Task: "T024 MIN_CUTOFF_DATES + API_PATH em web/src/engine/backtestEngine.ts e web/src/services/caixaApi.ts"
Task: "T027 tema, seletor e locales da Quina em web/src/theme.ts e web/src/components/LotterySelector.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Setup (T001–T004) — dourados e pré-registro, mesclados.
2. Foundational (T005–T020) — parametrizar sem mudar saídas; gerar o histórico.
3. US1 (T021–T034) — Quina no backtesting nas três plataformas.
4. **PARAR e validar**: dourados inalterados, `quickstart.md` passos 3–5.

### Incremental Delivery

Setup + Foundational → US1 (MVP) → US2 (volante/fechamento) → US3 (controles e honestidade) → US4 (manutenção do histórico) → Polish. Cada história é entregável sozinha; o fechamento Kotlin (T039) é o único item com *fallback* declarado.

### Entregas em PRs

Uma sequência de PRs pequenos em `main`, nesta ordem: (1) T001–T002, (2) T003–T004, (3) refatoração Kotlin T005–T009, (4) refatoração TS T010–T014 + T015, (5) dados T016–T020, (6) US1 web, (7) US1 Kotlin, … — cada um verde no CI antes de mesclar, nunca com o dourado alterado.

---

## Notes

- [P] = arquivos diferentes, sem dependência entre si.
- [Story] liga cada tarefa à história para rastreabilidade.
- Cada história deve ser completável e testável de forma independente.
- Commitar após cada tarefa ou grupo lógico; parar em cada checkpoint para validar.
- Nunca editar um dourado para fazer um teste passar.
