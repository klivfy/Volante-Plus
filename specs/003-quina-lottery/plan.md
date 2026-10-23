# Implementation Plan: Modalidade Quina com o mesmo protocolo de backtesting

**Branch**: `003-quina-lottery` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-quina-lottery/spec.md`

## Summary

Acrescentar a Quina (5 dezenas sorteadas de 1–80, aposta de 5 a 15, sem
trevo, 4 faixas) como terceira modalidade em web, Android e desktop,
**sem mudar nenhum número de Mega-Sena e +Milionária** (SC-005). O trabalho
tem duas camadas:

1. **Parametrizar o que hoje é fixo em "6 dezenas"**: no Kotlin a constante
   global `Draw.NUMBERS_DRAWN`/`GameGenerator.GAME_SIZE` (usada, entre
   outros, por `Hypergeometric`, `BacktestAnalyzer`, `PayoutShare` e
   `AccumulatedReturn`), no TypeScript o `GAME_SIZE` de `payoutShare.ts` e o
   preço único `SIMPLE_BET_PRICE_BRL`. Isso é feito **primeiro**, atrás de um
   teste de regressão dourado das duas modalidades existentes.
2. **Acrescentar a Quina** nas regras (faixas, preço, fração de prêmio),
   no histórico embutido (7.149 concursos hoje, 1994-03-13 a 2026-10-22), na
   sincronização, no volante/fechamento e na UI — com o histórico gerado de
   **uma única fonte** (`web/src/data/history/quina.json`) para web e Android
   (Princípio V) e cruzado concurso a concurso contra o **portal da Caixa**,
   que respondeu da máquina de desenvolvimento (ver `research.md`, Decisão 2).

O instrumento de backtesting é o mesmo; o que a Quina acrescenta de novo ao
rigor é a ordem das tarefas: os critérios dos controles negativo e positivo
são commitados **antes** de qualquer execução sobre o histórico real da
Quina (Princípio II) e nenhuma ponderação derivada dele chega à UI sem o
rótulo de hipótese (Princípio I).

## Technical Context

**Language/Version**: Kotlin Multiplatform (`shared/`, JUnit4 em `app/src/test`)
para Android e desktop; TypeScript/Next.js 16 (`web/`, vitest + Playwright);
Node.js ESM (`.mjs`) para os scripts de geração de seed, como em
`web/scripts/update-history-seed.mjs` e `scripts/generate-android-seed.mjs`.

**Primary Dependencies**: Nenhuma nova. Room (Android) e Dexie (web) já
persistem `lottery` como texto/chave; nenhuma biblioteca de cobertura ou de
estatística é adicionada.

**Storage**: Nada de esquema novo. Android: Room `version = 1`,
`exportSchema = false`, `lottery` gravado pelo **nome** do enum (sem
ordinal) e chave `(lottery, contestNumber)` — uma linha `QUINA` não exige
migração. Web: Dexie `version(1)` com índices `[lottery+contestNumber]`,
`[lottery+date]`, `lottery` — valor novo, sem bump. Seeds são arquivos
estáticos versionados.

**Testing**: `./gradlew :app:testDebugUnitTest` (a suíte JVM é o único lugar
de testes Kotlin; `shared/` não tem `commonTest`) e `npm test`/`npm run
test:e2e` em `web/`. O ambiente de desenvolvimento remoto não resolve o
plugin do Android; o CI do GitHub é a validação autoritativa do Kotlin.

**Target Platform**: Android (Compose), Windows desktop (Compose
Multiplatform sobre `shared/`), web PWA + extensões de navegador.

**Project Type**: Extensão de domínio multiplataforma (modalidade nova) —
nenhum módulo, serviço ou camada nova.

**Performance Goals**: Abrir a Quina e gerar o relatório não pode ficar
perceptivelmente mais lento que nas outras (SC-007). Escala: ~7.149
concursos (2,3× a Mega-Sena) → seed web ≈ 260 KB cru; carregado por `import()`
dinâmico sob demanda, fora do bundle inicial. Verificar o tempo do backtest
na Quina com a janela de validação padrão contra o da Mega-Sena.

**Constraints**: (a) SC-005 — resultados de Mega-Sena/+Milionária idênticos
antes/depois, provados por teste dourado; (b) o seed é derivado da fonte
única, sem segunda busca (Princípio V); (c) nada de rede nos testes
automatizados; (d) preço e frações de prêmio **por modalidade**, nunca
herdados por acidente.

**Scale/Scope**: ~35 arquivos de código tocados (≈10 Kotlin, ≈25 web) + 3
seeds/snapshots novos + testes + docs. Detalhado em *Project Structure*.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Aplica-se? | Avaliação |
|---|---|---|
| I. Sem alegação preditiva sem evidência replicada (NÃO NEGOCIÁVEL) | **Sim** | A Quina reutiliza as estratégias atuais ("Mais sorteadas" etc.), que já são rotuladas como hipótese sob teste. Nenhum texto novo pode sugerir vantagem; os textos que listam modalidades ("Gerador estatístico para Mega-Sena e +Milionária") são atualizados sem adjetivo novo. Tarefa explícita de varrer UI/docs. |
| II. Pré-registro antes do dado | **Sim** | Os critérios (`ALPHA`, réplicas, viés alternativo) já são constantes globais de `preregistration.ts` e as grandezas por modalidade são derivadas das regras; a Quina **não cria critério novo** nem muda `PREREGISTRATION_VERSION`. O que se registra **antes** de qualquer execução sobre o histórico real da Quina são os valores derivados esperados (K=5, N=80: repetição `K²/N` = 25/80, soma 202,5, variância 2531,25) e o desenho dos controles, em `contracts/quina-preregistration.md`; a ordem das tarefas reflete isso. |
| III. Controles negativo e positivo (NÃO NEGOCIÁVEL) | **Sim — vincula o desenho de testes** | (1) Controle negativo: histórico simulado i.i.d. de Quina não acusa sinal além do falso positivo declarado. (2) Controle positivo: viés injetado de tamanho conhecido é detectado. (3) Fórmulas novas — probabilidades por faixa, `C(80,5)`, esperança de retorno — são conferidas contra cálculo independente (soma binomial/Monte Carlo) e contra a tabela oficial da Caixa. (4) Testes do seed rejeitam seed corrompido (lacuna, dezena fora de 1–80, 6 dezenas), como em `SeedHistoryIntegrityTest`. |
| IV. Procedência e limitações sempre declaradas | **Sim** | O seed da Quina vem da API de terceiros (`loteriascaixa-api`) e é rotulado `third_party_mirror`; a conferência contra o portal da Caixa é registrada em `meta.json` (`crossChecked`) e **não** promove o rótulo a `official`. As datas da Quina são reais (diferente do espelho antigo, de datas sintéticas) e entram na comparação. |
| V. Domínio único compartilhado entre plataformas (eixo da feature) | **Sim** | Uma implementação por linguagem (`shared/` e `web/src/engine/`), com constantes e fórmulas portadas byte a byte e testes de equivalência cruzados (mesmos casos nos dois lados). Histórico: `web/src/data/history/quina.json` é a fonte; o CSV do Android é **gerado** dele. Tabelas de fechamento para k=5 geradas **uma vez** por script e emitidas para TS e Kotlin a partir do mesmo dado. |
| VI. Leia a documentação antes de código contra dependência não familiar | **Sim (condicional)** | Mudanças na UI web são em MUI/React (`LotterySelector`, tema). Qualquer toque em API do Next 16 (importação dinâmica de JSON, cache PWA) exige ler o guia em `web/node_modules/next/dist/docs/` antes, conforme `web/AGENTS.md`. |

**Resultado**: PASS. Sem violação a justificar. Um risco de coordenação
(feature 002 também altera `prizeRules`/`PrizeTable`) está em *Riscos*, não em
*Complexity Tracking*, pois não viola princípio algum.

## Riscos e coordenação

- **Feature `002-generation-five-families`** (planejada, ainda sem código
  mesclado) corrigirá fração de prêmio e faixas da +Milionária e o preço
  único. Esta feature **não altera os valores atuais** das duas modalidades;
  ela só torna preço/fração *por modalidade*, o que a 002 precisará de
  qualquer jeito. Ordem de merge livre; quem vier depois resolve conflito em
  `PrizeTable.kt`/`prizeRules.ts`/`closureDesigner.ts`.
- **Quina de São João e acúmulo (30% da premiação bruta fora das 4 faixas
  ordinárias)**: modelados como na Mega-Sena — a fração que não é paga no
  concurso comum fica fora da lista de faixas, sem fabricar um valor
  (Princípio IV). O texto oficial lido é ambíguo sobre os 15% + 15%; os
  percentuais exatos são conferidos contra o regulamento na primeira tarefa
  da fase de prêmios.
- **Fechamento em Kotlin com k=5**: `ClosureDesigner` só tem tabelas k=6. É o
  item de maior esforço; tem *fallback* declarado (Decisão 5 em `research.md`):
  se não fechar a tempo, a Quina entra no Android/desktop sem a aba Fechamento
  (guarda igual à da +Milionária) e a web mantém o fechamento.

## Project Structure

### Documentation (this feature)

```text
specs/003-quina-lottery/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões e alternativas
├── data-model.md        # Fase 1 — entidade Quina, formatos de seed
├── contracts/
│   ├── quina-official-rules.md   # regras, faixas, preço, chances (verificáveis)
│   ├── history-seed.md           # fonte única → web JSON → CSV Android; meta.json
│   ├── cross-platform-parity.md  # o que Kotlin e TS devem provar igual
│   └── quina-preregistration.md  # criado em T004: valores derivados e controles, antes do dado real
├── quickstart.md        # Fase 1 — roteiro de validação ponta a ponta
└── tasks.md             # Fase 2 (/speckit-tasks, não criado aqui)
```

### Source Code (repository root)

```text
shared/src/commonMain/kotlin/com/volanteplus/loterias/
├── domain/model/Lottery.kt          # + QUINA (último!), + numbersDrawn por modalidade
├── domain/model/Draw.kt             # NUMBERS_DRAWN → lottery.numbersDrawn
├── domain/backtest/
│   ├── PrizeRules.kt                # + ramo QUINA (isPrize ≥2, tierIndex 5/4/3/2, tierCount 4)
│   ├── PrizeTable.kt                # preço e fração de prêmio por modalidade; + faixas Quina
│   ├── Hypergeometric.kt            # K e n por modalidade (hoje 6 fixo)
│   ├── BacktestAnalyzer.kt          # sampleSize por modalidade
│   ├── AccumulatedReturn.kt         # binomial(universo, k) com k por modalidade
│   └── PayoutShare.kt               # GAME_SIZE por modalidade
├── domain/generator/
│   ├── GameGenerator.kt             # GAME_SIZE → lottery.numbersDrawn
│   └── ClosureDesigner.kt           # k genérico; tabelas C(v,5,t) para Quina
└── data/remote/CaixaLotteryApi.kt   # + QUINA -> "quina"

app/src/main/
├── assets/seed/quina.csv            # NOVO — gerado de web/src/data/history/quina.json
├── assets/seed/README.md            # ATUALIZADO
├── java/.../data/seed/AssetDrawSeeder.kt   # + QUINA -> "seed/quina.csv"
├── java/.../ui/volante/{VolanteViewModel,VolanteScreen}.kt   # grade/colunas, guarda de fechamento
├── java/.../ui/backtest/BacktestScreen.kt                    # linhas de acertos 0..numbersDrawn
└── res/values/strings.xml           # slogan com as três modalidades

app/src/test/java/com/volanteplus/loterias/   # testes por modalidade + paridade + dourado
desktop/src/main/kotlin/com/volanteplus/desktop/ui/{backtest,volante}/    # (0..6), colunas, guarda

web/
├── src/types/domain.ts                         # + Lottery.QUINA
├── src/engine/prizeRules.ts                    # + QUINA_TIERS, regras, preço por modalidade
├── src/engine/closureDesigner.ts               # preço por modalidade; k=5 pelo caminho guloso/tabelas
├── src/engine/closureTables.ts                 # + tabelas k=5 (geradas)
├── src/engine/payoutShare.ts                   # GAME_SIZE → numbersPerBet
├── src/engine/backtestEngine.ts                # MIN_CUTOFF_DATES.quina
├── src/engine/audit/{mirrorSource,provenance}.ts  # snapshot Quina (import lazy)
├── src/services/{caixaApi,syncService,db}.ts   # API_PATH.quina; ALL_LOTTERIES derivado do enum
├── src/data/history/{quina.json,meta.json,index.ts}  # NOVO seed + case no carregador + versão
├── src/data/mirrorSnapshot/quina.json          # NOVO — coletado do portal da Caixa
├── src/data/syntheticFixture/{index.ts,quina.json}   # fixture sintética p/ a guarda de procedência
├── src/theme.ts, components/LotterySelector.tsx, locales/pt-BR/common.json
├── src/app/analise-avancada/page.tsx           # ternários Mega/Mil → derivados de prizeTiers
├── scripts/update-history-seed.mjs             # + RULES.quina; cruza datas quando o espelho as tem
└── src/**/__tests__/                           # fixtures.ts, provenance, parity, history, controles

extension/src/sync.ts, extension/popup-app/.../PopupContent.tsx   # lista de modalidades
scripts/generate-android-seed.mjs               # + RULES.quina (5 dezenas, 1–80)
scripts/generate-closure-tables.mjs             # NOVO — tabelas k=5 → TS e Kotlin
docs/historico.md, README.md, CHANGELOG.md, docs/*.md (menções a modalidades)
```

**Structure Decision**: nenhuma estrutura nova de projeto. A feature estende
as duas hierarquias de domínio existentes (uma por linguagem, Princípio V), os
dois scripts de seed já existentes e a UI atual. A única adição estrutural é
`scripts/generate-closure-tables.mjs`, justificada na Decisão 5: tabelas de
cobertura são dado, e dado compartilhado entre duas linguagens é gerado de
uma fonte, nunca digitado duas vezes.

## Complexity Tracking

*Vazio — nenhuma violação da Constitution Check a justificar.*

## Constitution Check — reavaliação pós-design (Fase 1)

Os artefatos da Fase 1 não abriram violação nova:

- `data-model.md` confirma o Princípio V: um único formato de concurso
  (`contestNumber`, `date`, 5 `numbers`) para web, CSV Android e desktop; o CSV
  é derivado, não fonte.
- `contracts/quina-official-rules.md` fixa os valores verificáveis (1 em
  24.040.016 etc.) que o Princípio III exige conferir de forma independente,
  e registra a ambiguidade do regulamento em vez de escondê-la (Princípio IV).
- `contracts/cross-platform-parity.md` torna a equivalência Kotlin↔TypeScript
  um conjunto de casos executados nos dois lados.
- `quickstart.md` coloca o teste dourado de SC-005 **antes** da refatoração e
  os critérios dos controles **antes** do dado real (Princípio II).

**Resultado**: PASS, mantido.
