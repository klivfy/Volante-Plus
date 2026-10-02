---

description: "Task list template for feature implementation"
---

# Tasks: Seed Completo do Histórico Oficial no Android

**Input**: Design documents from `/specs/001-populate-android-seed/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/csv-seed-format.md, quickstart.md

**Tests**: Incluídos — a especificação exige verificação automatizada (FR-008, User Story 3) e a Constituição (Princípio III, NÃO NEGOCIÁVEL) exige controle positivo/negativo, não é opcional nesta feature.

**Organization**: Tarefas agrupadas pelas 3 histórias de usuário de `spec.md`, em ordem de prioridade (P1 → P2 → P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência entre si)
- **[Story]**: A qual história de usuário a tarefa pertence (US1, US2, US3)

## Path Conventions

Projeto único (monorepo com módulos existentes) — caminhos reais do repositório,
conforme `plan.md` → Project Structure.

---

## Phase 1: Setup

**Purpose**: Criar o arquivo do script gerador, vazio de lógica, com o
cabeçalho de documentação no mesmo estilo do script web equivalente.

- [X] T001 Criar `scripts/generate-android-seed.mjs` com comentário de
  cabeçalho (uso: `node scripts/generate-android-seed.mjs`) e import dos
  módulos Node built-in (`node:fs`, `node:path`) — sem lógica ainda,
  mesmo estilo de cabeçalho de `web/scripts/update-history-seed.mjs`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: A lógica de leitura, validação e serialização que tanto a
geração inicial (US1) quanto a regeneração futura (US2) usam — nenhuma
história de usuário pode ser entregue sem isto.

**⚠️ CRITICAL**: Nenhuma tarefa de história de usuário começa antes desta fase.

- [X] T002 Implementar em `scripts/generate-android-seed.mjs` a leitura de
  `web/src/data/history/megasena.json`, `web/src/data/history/maismilionaria.json`
  e `web/src/data/history/meta.json` — sem nenhuma chamada de rede (Constitution,
  Princípio V; `research.md` Decisão 1). Erro descritivo e saída sem gravar
  nada se qualquer arquivo estiver ausente.
- [X] T003 Implementar em `scripts/generate-android-seed.mjs` a validação por
  modalidade, abortando sem gravar nada (fail-closed) se qualquer uma
  falhar (`data-model.md`, `research.md` Decisão 4; FR-004, FR-006):
  sequência de `contestNumber` contígua de 1 até o último, sem lacuna nem
  duplicata; `numbers` com exatamente 6 valores distintos dentro do
  universo da modalidade (1–60 Mega-Sena, 1–50 +Milionária); `trevos`
  vazio na Mega-Sena e exatamente 2 valores distintos dentro de 1–6 na
  +Milionária; `date` parseável como ISO-8601.
- [X] T004 Implementar em `scripts/generate-android-seed.mjs` a serialização
  para o formato documentado em `contracts/csv-seed-format.md`: linha de
  cabeçalho `# concurso;data;dezenas;trevos`, colunas separadas por `;`,
  dezenas/trevos separados por espaço em ordem crescente, coluna de trevos
  vazia na Mega-Sena, linhas ordenadas por `concurso` crescente, saída
  determinística (nada dependente de timestamp/locale/ordem de iteração).

**Checkpoint**: lógica de geração pronta — as histórias de usuário abaixo já
podem ser entregues.

---

## Phase 3: User Story 1 - App Android nasce completo, mesmo sem rede (Priority: P1) 🎯 MVP

**Goal**: Instalação nova do app tem o histórico oficial completo
disponível localmente, sem depender de rede.

**Independent Test**: instalar o app num dispositivo com a rede desligada,
abrir a tela de Backtesting e confirmar que o histórico cobre do primeiro
concurso de cada modalidade até o último do seed.

### Implementation for User Story 1

- [X] T005 [US1] Rodar `node scripts/generate-android-seed.mjs` e commitar o
  resultado em `app/src/main/assets/seed/megasena.csv` e
  `app/src/main/assets/seed/maismilionaria.csv`.
- [X] T006 [P] [US1] Conferir que `app/src/main/assets/seed/megasena.csv`
  cobre `contestNumber` de 1 até `web/src/data/history/meta.json` →
  `lotteries.megasena.lastContest`, com contagem de linhas igual a
  `lotteries.megasena.count` (SC-002).
- [X] T007 [P] [US1] Conferir que
  `app/src/main/assets/seed/maismilionaria.csv` cobre `contestNumber` de 1
  até `meta.json` → `lotteries.maismilionaria.lastContest`, com contagem
  igual a `lotteries.maismilionaria.count` (SC-002).
- [ ] T008 [US1] Validar manualmente o Passo 3 de
  `specs/001-populate-android-seed/quickstart.md` (SC-001): instalar o app
  num emulador/dispositivo sem dados locais prévios e em modo avião, abrir
  a tela de Backtesting e confirmar que o relatório cobre o histórico
  completo do seed, sem erro de rede bloqueando o fluxo.
- [ ] T009 [US1] Validar manualmente o Passo 4 de
  `specs/001-populate-android-seed/quickstart.md` (FR-007, edge case): num
  dispositivo com histórico já sincronizado antes desta feature, atualizar
  o app e confirmar que `AssetDrawSeeder.seedIfEmpty` não duplica nem
  sobrescreve os concursos já salvos localmente.

**Checkpoint**: User Story 1 funcional e testável de forma independente.

---

## Phase 4: User Story 2 - Seed do Android nunca diverge do histórico já validado na web (Priority: P2)

**Goal**: Regenerar o histórico embutido do Android a partir do histórico
já validado na web é uma operação repetível, documentada e auditável.

**Independent Test**: rodar o processo de atualização e confirmar que ele
relata quantos concursos foram incluídos por modalidade e a data do último
concurso coberto, sem buscar dado de nenhuma fonte além da já validada na
web.

### Implementation for User Story 2

- [X] T010 [US2] Implementar em `scripts/generate-android-seed.mjs` o
  resumo impresso ao final (FR-005): quantidade de concursos incluídos e
  data do último concurso coberto, por modalidade.
- [X] T011 [P] [US2] Atualizar `app/src/main/assets/seed/README.md`: trocar
  a instrução "coloque aqui manualmente" pelo comando de geração
  (`node scripts/generate-android-seed.mjs`) e manter a ressalva de
  procedência (Constitution, Princípio IV — fonte é agregação de
  terceiros, não a exportação direta da Caixa, mesma nota já em
  `docs/historico.md`).
- [X] T012 [US2] Confirmar o determinismo (`research.md` Decisão 5;
  `contracts/csv-seed-format.md`): rodar o script duas vezes seguidas sem
  mudar a fonte e comparar que `megasena.csv`/`maismilionaria.csv` saem
  byte a byte idênticos nas duas rodadas.

**Checkpoint**: User Stories 1 e 2 funcionais juntas.

---

## Phase 5: User Story 3 - Um seed corrompido ou incompleto nunca chega a ser distribuído (Priority: P3)

**Goal**: Garantia automatizada de que o histórico embutido não tem
lacunas, não viola regras de modalidade, e é reconhecido pelo app ao ser
importado.

**Independent Test**: rodar a suíte de testes sobre o seed gerado (passa) e
sobre uma versão deliberadamente corrompida (falha, apontando o problema).

### Tests for User Story 3 ⚠️

> Controles negativo/positivo são o próprio objeto desta história —
> Constitution, Princípio III (NÃO NEGOCIÁVEL).

- [X] T013 [US3] Criar
  `app/src/test/java/com/volanteplus/loterias/data/seed/SeedHistoryIntegrityTest.kt`
  (JUnit4, mesmo estilo de `CsvDrawParserTest.kt` já existente no mesmo
  pacote): carregar os dois CSVs commitados em
  `app/src/main/assets/seed/` e confirmar que `CsvDrawParser.parse` não
  lança erro para nenhum dos dois, e que a sequência de `contestNumber` é
  contígua de 1 até o último, sem lacuna nem duplicata, em cada
  modalidade.
- [X] T014 [US3] No mesmo arquivo de teste, confirmar que a contagem e o
  último `contestNumber` parseados de cada CSV batem exatamente com
  `web/src/data/history/meta.json` (SC-002).
- [X] T015 [US3] No mesmo arquivo de teste, adicionar o controle positivo
  exigido pela Constituição: uma fixture deliberadamente corrompida (ex.:
  uma linha de Mega-Sena com uma dezena 61, fora do universo 1–60) MUST
  falhar em `CsvDrawParser.parse` com um erro claro e localizável (número
  da linha).
- [X] T016 [US3] No mesmo arquivo de teste, adicionar um segundo caso de
  controle positivo: uma fixture com lacuna na sequência de concursos
  (ex.: concurso 2 ausente entre 1 e 3) MUST ser rejeitada pela checagem de
  contiguidade de T013 — `CsvDrawParser` sozinho não detecta lacunas entre
  concursos, só dentro de cada linha, então esta é uma asserção do próprio
  teste de integridade, não do parser.

**Checkpoint**: as três histórias de usuário funcionais.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Fechar a rastreabilidade documental e confirmar que nada
regrediu.

- [X] T017 [P] Marcar como concluído, em `README.md` (raiz), o item do
  Roadmap "Popular `assets/seed/` com o histórico oficial".
- [X] T018 [P] Adicionar em `docs/historico.md` uma nota curta de
  rastreabilidade: o seed do Android é gerado a partir deste mesmo
  histórico embutido via `scripts/generate-android-seed.mjs`.
- [X] T019 Rodar `./gradlew :app:testDebugUnitTest` completo e confirmar
  que nenhum teste existente (incluindo `CsvDrawParserTest.kt`) regrediu.
- [ ] T020 Rodar os 4 passos de `specs/001-populate-android-seed/quickstart.md`
  de ponta a ponta como validação final de aceite.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — T001 começa imediatamente.
- **Foundational (Phase 2)**: depende de T001; BLOQUEIA todas as histórias
  de usuário (T002 → T003 → T004, sequencial, mesmo arquivo).
- **User Stories (Phase 3-5)**: todas dependem da Fase 2 completa.
  - US1 (T005-T009) não depende de US2/US3.
  - US2 (T010-T012) pode rodar em paralelo a US1 depois da Fundação, mas
    T010/T012 tocam o mesmo arquivo que a Fundação terminou de escrever
    (`scripts/generate-android-seed.mjs`) — na prática, roda logo após T005
    para não conflitar com o mesmo arquivo gerado.
  - US3 (T013-T016) só faz sentido depois que T005 existir (precisa dos
    CSVs commitados para testar) — depende de US1, mesmo sem reescrever
    nenhum arquivo de US1.
- **Polish (Phase 6)**: depende de todas as histórias desejadas estarem
  completas.

### Dentro de cada história

- US1: T005 antes de T006/T007 (que leem o resultado de T005); T008/T009
  são validação manual, depois de T005-T007.
- US2: T010 e T012 tocam o mesmo arquivo de T005 (script) — sequenciais
  entre si e em relação a T005; T011 (arquivo diferente) é paralelo a eles.
- US3: T013 antes de T014-T016 (todas no mesmo arquivo novo, sequenciais).

### Parallel Opportunities

- T006 e T007 (arquivos CSV diferentes) podem rodar em paralelo.
- T011 (README) pode rodar em paralelo a T010/T012 (script).
- T017 e T018 (arquivos diferentes) podem rodar em paralelo.
- T002, T003, T004 e T013-T016 editam, cada bloco, um único arquivo
  compartilhado — não são paralelizáveis entre si, mesmo dentro da mesma
  fase.

---

## Parallel Example: User Story 1

```bash
# Depois de T005 (geração), as duas conferências de contagem são independentes:
Task: "Conferir contagem/intervalo de megasena.csv contra meta.json"
Task: "Conferir contagem/intervalo de maismilionaria.csv contra meta.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 somente)

1. Completar Fase 1: Setup (T001).
2. Completar Fase 2: Foundational (T002-T004) — bloqueia tudo abaixo.
3. Completar Fase 3: User Story 1 (T005-T009).
4. **PARAR e VALIDAR**: rodar o Passo 3 do `quickstart.md` (app offline).
   Isto já fecha o item do Roadmap na prática — US2 e US3 são sobre
   manter esse estado confiável no futuro, não sobre o estado em si.

### Incremental Delivery

1. Setup + Foundational → script gerador funcional.
2. US1 → seed real commitado, app nasce completo (MVP).
3. US2 → mecanismo de regeneração documentado e verificado determinístico.
4. US3 → rede de segurança automatizada contra regressão futura do seed.
5. Polish → documentação fechada, suíte completa confirmada sem regressão.

---

## Notes

- [P] = arquivos diferentes, sem dependência entre as tarefas.
- Rótulo [Story] mapeia a tarefa para a história de usuário correspondente
  em `spec.md`.
- T002-T004 e T013-T016 são, cada bloco, o mesmo arquivo — nunca marcados
  [P] entre si, mesmo pertencendo à mesma fase/história.
- Ao final de T015/T016, a suíte MUST falhar antes de qualquer correção no
  parser ser cogitada — essa é a prova de que o controle positivo está
  mesmo testando algo (Constitution, Princípio III).
