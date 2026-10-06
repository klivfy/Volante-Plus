---

description: "Tarefas da feature 002 — método de geração à luz das cinco famílias"
---

# Tasks: Método de geração à luz das cinco famílias de métodos (Mega-Sena e +Milionária)

**Input**: `/specs/002-generation-five-families/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan.md e spec.md (presentes). Ler `.specify/memory/constitution.md` antes de começar.

**Tests**: INCLUÍDOS. A Constituição (Princípios I e III) e o plano exigem teste junto com toda mudança em `web/src/engine/`, com controle negativo e positivo para cada instrumento novo e conferência independente para cada fórmula fechada nova. Os testes vêm **antes** do código que cobrem.

**Organization**: tarefas agrupadas por história de usuário. Cada fase de implementação do plano (0–8) é um PR. A ordem das fases abaixo segue a prioridade da spec (US1, US2 = P1; US3, US4 = P2; US5, US6 = P3); pelas dependências de dados, US3 pode andar em paralelo com US2 (ambas só dependem da Fase 2).

## Format: `[ID] [P?] [Story] Descrição com caminho de arquivo`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1…US6 (só nas fases de história)
- Caminhos relativos à raiz do repositório. `web/` = Next.js 16 + motor TypeScript; `shared/` = KMP; `app/` = Android.

## Regras que valem para todas as tarefas

- Nenhuma tarefa altera a chance de uma combinação: o motor só escolhe **entre candidatos equiprováveis** (Princípio I).
- Nenhum número derivado vai para a tela sem a ressalva do mesmo painel (`contracts/ui-claims.md`).
- Antes de mexer em página ou componente: ler `web/node_modules/next/dist/docs/` (Princípio VI, `web/AGENTS.md`).
- Valores marcados † em `research.md` e itens "a confirmar" (repasse da Virada, limite de isenção do IR, valores estimados líquidos?, datas de reajuste de preço, concurso do globo único, rodízio de bolas, C(15,6,5) no La Jolla) devem ser conferidos em fonte primária **dentro da tarefa que os consome** e a procedência gravada no JSON.
- Fim de cada PR: `cd web && npm run lint && npx tsc --noEmit && npm test && npm run build`; CHANGELOG e documentação no mesmo PR (FR-042).

---

## Phase 1: Setup — Fase 0 do plano (pré-registros antes do dado)

**Purpose**: congelar critérios estatísticos **antes** de baixar qualquer histórico de rateio (Princípio II, FR-038).

- [ ] T001 Rodar a linha de base verde e registrá-la na descrição do PR: `cd web && npm ci && npm run lint && npx tsc --noEmit && npm test`
- [ ] T002 [P] Criar `web/src/engine/popularity/preregistration.ts` com os critérios congelados da popularidade (métricas de validação em 3 vias, limiares das decisões `CALIBRATED_ADOPTED` / `HEURISTIC_KEPT` / `NO_SUPPORT`, split temporal, sementes, controles negativo ≤ 5% e positivo ≥ 80%; `data-model.md › PopularityModel`, `research.md` R6, R13)
- [ ] T003 [P] Criar `web/src/engine/demandModel.preregistration.ts` com os critérios do modelo de demanda log-linear (métrica fora da amostra, limiar de adoção, regra de fallback `lastCollection`; `research.md` R7, R13)
- [ ] T004 [P] Estender `web/src/engine/audit/preregistration.ts` (v2): constantes do Módulo B v2 (12 estratégias, veredito, medidor de sobreajuste dentro × fora da amostra) e dos testes forenses A6–A10 (níveis, correção para comparações múltiplas, poder mínimo 80%, menor efeito detectável; `research.md` R12, R13)
- [ ] T005 Rodar as simulações de poder que fixam os limiares dos T002–T004 e gravar os resultados como constantes e comentários datados nos mesmos arquivos (sementes fixas; sem tocar em histórico de rateio real)
- [ ] T006 Commitar os pré-registros **sozinhos**, num commit anterior a qualquer arquivo em `web/src/data/rateio/`; o hash vira `preregistration.commit` dos artefatos (`contracts/model-artifacts.md`)
- [ ] T007 [P] Criar `web/scripts/lib/preregistrationGuard.mjs`: recusa rodar se os arquivos de pré-registro tiverem alteração não commitada e devolve o hash do commit (usado por `update-rateio-seed`, `fit-popularity`, `fit-demand`, `run-lab`)

**Checkpoint**: `git log --format='%H %ad' -- <arquivos de pré-registro>` mostra commits anteriores a qualquer dado de rateio (`quickstart.md`, Fase 0).

---

## Phase 2: Foundational — regras como dados e histórico de rateio (Fase 2 do plano)

**Purpose**: fundação de dados que bloqueia US2, US3 e US6. As regras oficiais (US1) são fundação de tudo, então vêm primeiro.

**⚠️ CRITICAL**: nenhuma história começa antes de T008–T014.

- [ ] T008 Escrever `web/src/engine/__tests__/officialRules.test.ts`: o arquivo viola o contrato → `officialRules()` lança; todo valor tem `source` e `checkedAt` (FR-003); Mega com 3 faixas e +Milionária com 10 (`contracts/official-rules.md`)
- [ ] T009 Criar `web/src/data/rules/official-rules.json` (regras datadas: faixas, frações, reserva, IR, preços por era, concursos especiais; `data-model.md › OfficialRules`, `research.md` R1–R5) e `web/src/engine/officialRules.ts` (carga + validação). Resolver aqui os itens "a confirmar" de preço e IR com fonte primária
- [ ] T010 [P] Criar `scripts/sync-shared-models.mjs` (raiz): copia `official-rules.json` e `data/models/*.json` para os assets do Android, no padrão de `scripts/generate-android-seed.mjs`; incluir modo `--check` para o CI
- [ ] T011 Escrever teste de `web/src/services/rateioSource.ts` (fixtures, sem rede): concursos sem arrecadação ficam fora e nunca são imputados; valor monetário zerado em concurso antigo = ausente (`contracts/rateio-history.md`, `contracts/caixa-api-fields.md`)
- [ ] T012 Criar `web/scripts/update-rateio-seed.mjs` (guarda T007; baixa a API de terceiros, confere amostra contra a API oficial, grava `web/src/data/rateio/{megasena,maismilionaria}.json` + `meta.json` com procedência `third_party_mirror`, período e exclusões; modo `--check-only`) e `web/src/services/rateioSource.ts` (carga sob demanda, fora do bundle inicial). Fixar aqui o concurso a partir do qual há arrecadação na Mega (`plan.md › Scale/Scope`)
- [ ] T013 Rodar `node web/scripts/update-rateio-seed.mjs` e commitar o histórico de rateio **depois** do commit do T006
- [ ] T014 Escrever teste e implementar `fetchContestOutlook` em `web/src/services/caixaApi.ts` (nunca lança; devolve `null` ou panorama parcial com ausências explícitas; campos de `contracts/caixa-api-fields.md`; fixtures: regular, final 0/5, Virada, +Milionária com reserva)

**Checkpoint**: dados e regras carregam; `update-rateio-seed.mjs --check-only` passa.

---

## Phase 3: User Story 1 — Regras oficiais corretas e iguais nas duas modalidades (P1) 🎯 MVP

**Goal**: +Milionária em 10 faixas, fração 43,79%, reserva na ordem certa, garantias do fechamento que realmente pagam, web e Android com os mesmos números.

**Independent Test**: `quickstart.md › US1` — chance de prêmio 1/11,39 (+Milionária) e 1/2.297,56 (Mega); `classifyHits(MAIS_MILIONARIA,3,1)`→faixa 8, `(3,0)`→`null`, sem trevo → `RangeError`; bolo R$ 1,7145 por aposta; Kotlin = web.

### Tests for User Story 1

- [ ] T015 [P] [US1] Reescrever `web/src/engine/__tests__/prizeModel.test.ts`: bolo e reserva (reserva antes dos fixos), frações 43,79%, conservação (bolo ÷ apostas), IR com limite datado
- [ ] T016 [P] [US1] Atualizar `web/src/engine/__tests__/modalityParity.test.ts` e `powerAnalysis.test.ts`: `anyPrizeProbability` = 0,0877961323 e 0,0004352441; faixas 10 e 3; `classifyHits` com os casos acima
- [ ] T017 [P] [US1] Atualizar `web/src/engine/__tests__/closureDesigner.test.ts`: `offeredGuarantees(MAIS_MILIONARIA)` inclui 2 e 3 dezenas com `trevosMin = 1`; garantias que não pagam não aparecem
- [ ] T018 [P] [US1] Criar `app/src/test/java/com/volanteplus/loterias/domain/backtest/PrizeTableParityTest.kt`: lê `official-rules.json` e confere frações, ordem da reserva e faixas contra o domínio Kotlin

### Implementation for User Story 1

- [ ] T019 [US1] Corrigir `web/src/engine/prizeRules.ts`: derivar de `official-rules.json`; `prizeTiers`, `classifyHits`, `isPrized` com trevos obrigatórios na +Milionária (`contracts/engine-api.md`, FR-001, FR-006)
- [ ] T020 [US1] Criar `web/src/engine/prizeModel.ts`: `expectedReturnPerBet` (bolo, reserva, fixos, rateio, repasses, IR; só a faixa que acumula usa `1−(1−p)^N`; `contracts/engine-api.md`, FR-002)
- [ ] T021 [US1] Corrigir `web/src/engine/powerAnalysis.ts` (`anyPrizeProbability` com as 10 faixas) e os quatro módulos que avaliam a +Milionária sem trevos — localizar com `grep -rn "classifyHits\|isPrized\|anyPrize" web/src` e passar os trevos em cada chamada (FR-006): `expectedValue.ts`, `betPlanning.ts`, `strategyBenchmark.ts`, `fairnessTests.ts` (conferir a lista real no grep)
- [ ] T022 [US1] Atualizar `web/src/engine/closureDesigner.ts`: `Guarantee {numbers, trevosMin}` e `offeredGuarantees` só com o que paga pelas regras (FR-004)
- [ ] T023 [US1] Corrigir `shared/src/commonMain/kotlin/com/volanteplus/loterias/domain/backtest/PrizeTable.kt` (43,79%, ordem de dedução da reserva) e alinhar a estratégia padrão e o número de candidatos (64 × 12) com a web em `generator/GameGenerator.kt` (FR-005)
- [ ] T024 [US1] Corrigir o comentário desatualizado sobre arrecadação em `web/src/app/page.tsx` e fazer o seletor de garantia do Fechamento mostrar a condição de trevos (`quickstart.md › US1`, "Na tela")
- [ ] T025 [US1] Rodar `node scripts/sync-shared-models.mjs --check` e `./gradlew :app:testDebugUnitTest --tests '*PrizeTableParityTest*'`
- [ ] T026 [US1] CHANGELOG + bump `web/package.json` e lockfile **2.3.0 → 2.4.0** (primeiro PR que muda comportamento) e atualizar `docs/refinamento-estatistico.md` (FR-042)

**Checkpoint**: US1 entregável sozinha e já corrige os erros de fundação em produção.

---

## Phase 4: User Story 2 — Jogos menos disputados, medidos com dado brasileiro (P1)

**Goal**: substituir a heurística de popularidade por modelo calibrado e validado em 3 vias (ou manter a heurística validada, ou admitir `NO_SUPPORT`), sem tocar na chance.

**Independent Test**: `quickstart.md › US2` — soma por polinômios simétricos = força bruta (erro < 1e-12); decisão gravada recalculada; distribuição de acertos hipergeométrica; mesma semente = mesmo lote.

**Depends on**: Fase 1 (pré-registro), Fase 2 (rateio), US1 (faixas corretas).

### Tests for User Story 2

- [ ] T027 [P] [US2] Criar `web/src/engine/__tests__/popularitySymmetric.test.ts`: `e_k` por força bruta em N = 12, 6 sorteadas, erro relativo < 1e-12
- [ ] T028 [P] [US2] Criar `web/src/engine/__tests__/popularityModel.test.ts`: π(c)=s·u+(1−s)·∏wᵢ/e₆(w) soma 1; escolha uniforme × efeito do tamanho da literatura (controles do `fit-popularity`); decisão gravada recalculada a partir das métricas
- [ ] T029 [P] [US2] Atualizar `web/src/engine/__tests__/gameGenerator.test.ts`: propriedade da chance intocada (qui-quadrado sobre 100 mil jogos contra a hipergeométrica; **gerador enviesado de controle tem de falhar**); determinismo com `RandomSource` semeado; sementes diferentes → jogos diferentes
- [ ] T030 [P] [US2] Criar `app/src/test/java/com/volanteplus/loterias/domain/generator/PopularityParityTest.kt`: lê `popularity.json`

### Implementation for User Story 2

- [ ] T031 [P] [US2] Criar `web/src/engine/popularity/symmetric.ts` (polinômios simétricos elementares, soma exata por faixa)
- [ ] T032 [US2] Criar `web/src/engine/popularity/model.ts`: escore fatorado O(6), binomial negativa por faixa, dezenas + trevos + Surpresinha; `activePopularity`, `relativePopularity`, `expectedWinnersByTier` (`contracts/engine-api.md`)
- [ ] T033 [US2] Criar `web/scripts/fit-popularity.mjs` (guarda T007; `--controls-only` aborta se negativo > 5% ou positivo < 80%; Newton/IRLS e verossimilhança binomial negativa no motor; validação em 3 vias fora da amostra e em concursos posteriores ao pré-registro) → grava `web/src/data/models/popularity.json` (< 20 KB, com `preregistration.commit`, versão, período, data; `contracts/model-artifacts.md`)
- [ ] T034 [US2] Rodar `fit-popularity.mjs --controls-only` e depois sem a flag; commitar o artefato **qualquer que seja a decisão** (FR-009, FR-013); registrar a decisão no CHANGELOG
- [ ] T035 [US2] Refatorar `web/src/engine/unpopularity.ts` para delegar ao modelo adotado; `gameGenerator.ts` vira pipeline em camadas (candidatos uniformes → escolha pela popularidade ativa → trevos; modelo expirado cai para a heurística com aviso)
- [ ] T036 [US2] Escolha das duplas de trevos pela popularidade dos trevos na +Milionária (FR-011) e uso da mesma popularidade em `closureDesigner.ts` (FR-027) e `payoutShare.ts`
- [ ] T037 [US2] Atualizar `web/src/components/PayoutSharePanel.tsx` e o cartão do jogo: popularidade relativa, ganho condicional, ressalva `PAYOUT_DISCLAIMER` no mesmo cartão, rótulo do estado do modelo; em `NO_SUPPORT` **não** mostrar ganho e exibir o texto de `contracts/ui-claims.md` (FR-012)
- [ ] T038 [US2] Textos em `web/locales/pt-BR/common.json` e seção de metodologia em `web/src/app/sobre/page.tsx` com o resultado da validação, qualquer que seja
- [ ] T039 [US2] Criar `shared/.../generator/Unpopularity.kt` lendo o mesmo `popularity.json`; rodar `./gradlew :app:testDebugUnitTest --tests '*PopularityParityTest*'`
- [ ] T040 [US2] CHANGELOG e bump de versão web; atualizar `docs/metodos-estatisticos-adicionais.md`

**Checkpoint**: US2 entregável sozinha (com US1). Fases 1, 2 e 4 do plano = **MVP**.

---

## Phase 5: User Story 3 — O valor de cada concurso, sem ilusão (P2)

**Goal**: painel com retorno por real antes/depois do IR, perda esperada, acumulado de equilíbrio, Mandel, roll-down da Virada; indisponível com motivo quando faltar dado; nunca recomendar compra.

**Independent Test**: `quickstart.md › US3` — tabela de cenários (Mega 3.067: 40,1%/30,1%, Mandel 0,56/0,41; +Milionária 396: 31,0%/~26,6%, 0,49/~0,38; regulares 16,1% e 24,9%); Virada 0,25% com 300 mi; fixture sem arrecadação → `unavailable`; Monte Carlo = fórmula fechada.

**Depends on**: Fase 2 (rateio e `fetchContestOutlook`), US1 (`prizeModel`).

### Tests for User Story 3

- [ ] T041 [P] [US3] Criar `web/src/engine/__tests__/contestValue.test.ts` com as fixtures do instantâneo de 2026-10-06 e os valores da tabela acima; `returnPerReal.preTax < 1` em todo cenário; `mandelTest` sem saída que represente recomendação (FR-017)
- [ ] T042 [P] [US3] Conferência independente: Monte Carlo do rateio (ganhadores sorteados) bate a fórmula fechada dentro do erro de simulação (Princípio III)
- [ ] T043 [P] [US3] Teste do modelo de demanda: controles negativo e positivo, fallback `lastCollection`, `override` do usuário

### Implementation for User Story 3

- [ ] T044 [US3] Criar `web/src/engine/demandModel.ts` (`estimateTickets`: modelo log-linear → `lastCollection` → `user`) e `web/scripts/fit-demand.mjs` (guarda T007; controles → dado real → decisão) → `web/src/data/models/demand.json`; commitar o artefato qualquer que seja a decisão
- [ ] T045 [US3] Criar `web/src/engine/contestValue.ts`: `assessContest`, `mandelTest`, `viradaRollDown`; `availability: unavailable` + `reason` e **nenhum número** quando falta dado ou a regra do especial é desconhecida (FR-020); marca `nonNegativeEv` (FR-021). Resolver aqui a regra de repasse da Virada e se os valores estimados da API são líquidos
- [ ] T046 [US3] Criar `web/src/components/ContestValuePanel.tsx` com ressalvas obrigatórias, o que move o número (acumulado, final 0/5, Virada, reserva) e correção manual do nº de apostas que recalcula tudo (FR-014 a FR-019, `contracts/ui-claims.md`); integrar em `web/src/app/page.tsx`
- [ ] T047 [US3] Estado "indisponível" com motivo quando a rede falha; textos em `common.json`
- [ ] T048 [US3] CHANGELOG, bump de versão web e doc do método

**Checkpoint**: US3 funcional e testável sem US2.

---

## Phase 6: User Story 4 — Lote e fechamento com contrato honesto (P2)

**Goal**: lote com chance exata de ≥1 prêmio, trevos complementares na +Milionária, fechamento com contrato completo e garantia com trevos verificada exaustivamente.

**Independent Test**: `quickstart.md › US4` — +Milionária disjuntas: 17,25% / 25,42% / 32,91% (contra 17,15% / 25,11%); Mega 3 jogos 0,1306%; fechamentos em 3 cores verificados para pools de 7 a 12; fechamento corrompido falha (controle).

**Depends on**: US1 (US2 para combinar com popularidade).

### Tests for User Story 4

- [ ] T049 [P] [US4] Criar `web/src/engine/__tests__/batchStructure.test.ts`: `pAnyPrize` = enumeração por força bruta nos casos pequenos e os valores do `research.md` R10; `complementaryTrevoPairs`
- [ ] T050 [P] [US4] Estender `closureDesigner.test.ts`: verificação exaustiva (pools 7–12; garantias 2, 3 e 4 dezenas + 1 trevo); controle com fechamento corrompido; `generateClosure` nunca devolve `verified.method !== 'exhaustive'`

### Implementation for User Story 4

- [ ] T051 [US4] Criar `web/src/engine/batchStructure.ts` (`pAnyPrize` exata, `complementaryTrevoPairs`, desempate por popularidade quando houver modelo)
- [ ] T052 [US4] Reescrever `generateClosure`/`verifyClosure` em `closureDesigner.ts` (fechamento repetido em 3 cores; `ClosureContract` completo); ampliar `web/scripts/covering-search.mjs` com a busca colorida só como candidato, sujeita à mesma verificação. Conferir C(15,6,5)=578 em fonte primária antes de citar
- [ ] T053 [P] [US4] Criar `web/src/components/ClosureContract.tsx` (texto de `contracts/ui-claims.md › Contrato do fechamento`) e `web/src/components/BatchSummary.tsx` (chance de ≥1 prêmio, custo, retorno esperado, perda esperada; **sem** comparação de arranjos na Mega — `research.md` R10)
- [ ] T054 [US4] Integrar em `web/src/app/page.tsx`; textos e ressalva "O arranjo dos jogos não muda a chance de cada jogo…" em `common.json`
- [ ] T055 [US4] CHANGELOG, bump de versão web e doc

**Checkpoint**: US4 funcional.

---

## Phase 7: User Story 5 — Laboratório de hipóteses (A popular e C machine learning) (P3)

**Goal**: Módulo B v2 com 12 estratégias nas duas modalidades, pré-registrado, com medidor de sobreajuste; reprovações com o mesmo destaque; nada chega à geração.

**Independent Test**: `quickstart.md › US5` — controles (≤ 5% sob sorteio honesto; ≥ 80% com viés plantado por estratégia); relatório com as 12 estratégias; teste de grafo de importação.

**Depends on**: Fase 1 (pré-registro), US1.

### Tests for User Story 5

- [ ] T056 [P] [US5] Criar `web/src/engine/audit/__tests__/moduleB.test.ts`: controles negativo e positivo por estratégia, duas modalidades, com trevos
- [ ] T057 [P] [US5] Teste de grafo de importação: `gameGenerator.ts` não importa `strategyBenchmark.ts`, `predictors/*` nem `audit/moduleB.ts` (FR-031)

### Implementation for User Story 5

- [ ] T058 [P] [US5] Criar `web/src/engine/predictors/logisticFeatures.ts` e `web/src/engine/predictors/markovTransition.ts` (Família C)
- [ ] T059 [US5] Estender `web/src/engine/strategyBenchmark.ts` para 12 estratégias (+7 de A e C) com trevos, e `audit/moduleB.ts` para v2 (dentro × fora da amostra, diferença = sobreajuste; FR-028, FR-029)
- [ ] T060 [US5] Criar `web/scripts/run-lab.mjs --lab` (guarda T007) e rodar sobre o histórico real; commitar o relatório, aprovados e reprovados
- [ ] T061 [US5] Tela do laboratório em `web/src/app/analise-avancada/page.tsx`: "não aprovado" e "aprovado" com o mesmo tamanho, peso e contraste; texto fixo de `contracts/ui-claims.md › Laboratório` (FR-030)
- [ ] T062 [US5] CHANGELOG, doc (`docs/geracao-cinco-familias.md`, seção do laboratório)

**Checkpoint**: US5 funcional e isolada da geração.

---

## Phase 8: User Story 6 — Auditoria forense e portão (P3)

**Goal**: testes A6–A10 pré-registrados com controles; `forensicGate` com 4 estados; só viés do regime atual, replicado, altera a amostragem.

**Independent Test**: `quickstart.md › US6` — cada teste com controle negativo no nível declarado e positivo ≥ 80% (bola de unidade viciada, mistura fraca, estrato viciado, rodízio de bolas, ganhadores injetados); `forensicGate` = `NO_BIAS` a menos que haja viés replicado do regime atual.

**Depends on**: Fase 1, Fase 2 (A10 usa a popularidade da US2).

### Tests for User Story 6

- [ ] T063 [P] [US6] Criar `web/src/engine/audit/__tests__/forensics*.test.ts` (um por teste A6–A10) com controles negativo e positivo e relatório de poder e menor efeito detectável (FR-033 a FR-035)
- [ ] T064 [P] [US6] Criar `web/src/engine/audit/__tests__/gate.test.ts`: `CURRENT_REPLICATED` exige `evidence` não vazia do regime atual com replicação posterior ao commit do pré-registro; eras encerradas nunca mudam a geração

### Implementation for User Story 6

- [ ] T065 [P] [US6] Criar `web/src/engine/audit/forensics/globeDigits.ts` (A6, dígitos dos dois globos até o concurso 1.139) e `extractionOrder.ts` (A7)
- [ ] T066 [P] [US6] Criar `web/src/engine/audit/forensics/strata.ts` (A8, locais/eras) e `periodicity.ts` (A9)
- [ ] T067 [US6] Criar `web/src/engine/audit/forensics/winnersAnomaly.ts` (A10, ganhadores atípicos via `expectedWinnersByTier`; texto de triagem, não acusação — FR-037); confirmar em fonte primária o concurso da troca para globo único e o rodízio de bolas
- [ ] T068 [US6] Atualizar `audit/index.ts` (`runAudit` A1–A10) e criar `audit/gate.ts` (`forensicGate`, 4 estados); ligar o portão em `gameGenerator.ts` (só `CURRENT_REPLICATED` inclina a amostragem)
- [ ] T069 [US6] `run-lab.mjs --audit` sobre o histórico real; relatório e seção da tela de análise avançada com texto de era encerrada
- [ ] T070 [US6] CHANGELOG e doc

**Checkpoint**: US6 funcional; portão em `NO_BIAS` salvo evidência.

---

## Phase 9: Polish & transversal (Fase 8 do plano)

- [ ] T071 [P] Teste das frases proibidas: varre `web/locales/pt-BR/common.json`, `docs/*.md` novos e textos do motor (FR-040, `contracts/ui-claims.md › Frases proibidas`), com negação no mesmo período permitida
- [ ] T072 [P] Paridade de runtime no Android: modelos nos assets via `scripts/sync-shared-models.mjs`, estratégia padrão alinhada; `./gradlew :app:testDebugUnitTest`
- [ ] T073 [P] Criar `docs/geracao-cinco-familias.md` (o método, família por família) e atualizar `web/src/app/sobre/page.tsx` com as cinco famílias
- [ ] T074 Revisão de conteúdo SC-007 em todo PR com UI (checklist de `contracts/ui-claims.md`)
- [ ] T075 Rodar `quickstart.md` de ponta a ponta e `cd web && npm run lint && npx tsc --noEmit && npm test && npm run build && npm run test:e2e`
- [ ] T076 Versão final e CHANGELOG consolidado; deploy pelo fluxo existente do Netlify; tag `web-vX.Y.Z` (não `v*`, que dispara o APK)

---

## Dependencies & Execution Order

- **Fase 1 (Setup/pré-registro)** → **Fase 2 (Foundational)** → histórias.
- **US1** só depende da Fase 2 (regras como dados) — é o MVP e pode sair em PR próprio logo após T014 (T008–T009 bastam para começar; T011–T014 podem seguir em paralelo).
- **US2** depende de Fase 1, Fase 2 e US1. **US3** depende de Fase 2 e US1 (pode andar em paralelo com US2).
- **US4** depende de US1 (e de US2 só para desempate por popularidade).
- **US5** depende de Fase 1 e US1. **US6** depende de Fase 1, Fase 2 e US2 (A10).
- **Polish** por último.

### Parallel Opportunities

- Fase 1: T002, T003, T004, T007 em paralelo.
- US1: T015–T018 em paralelo; T019–T022 sequenciais por tocarem módulos que se chamam.
- US2: T027–T030 em paralelo; T031 com os testes.
- US3 ‖ US2 por pessoas diferentes após US1.
- US5 ‖ US6 após as dependências acima.

## Implementation Strategy

1. **MVP**: Fases 1 e 2 + US1 + US2 (plano: fases 1, 2 e 4) — regras certas e escolha de jogos com popularidade medida no Brasil, com `NO_SUPPORT` como resultado legítimo.
2. Incrementar com US3 e US4 (valor do concurso e lote), depois US5 e US6 (laboratório e forense).
3. Cada fase = um PR com teste, documentação, CHANGELOG e versão web no mesmo PR.
