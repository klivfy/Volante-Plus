# Data Model: Método de geração à luz das cinco famílias de métodos

Entidades da feature, com campos, validações e transições de estado. Nomes de
campo são indicativos para a implementação (TypeScript em `web/src/engine/`,
espelhado em Kotlin onde há paridade). Formatos de arquivo estão em
[contracts/](./contracts/).

## Visão geral

```
OfficialRules ──────────────┬──> PrizeModel ──> ValueAssessment
   (data/rules)             │                       ▲
                            │                       │ ContestOutlook (API, ao vivo)
RateioRecord ─┬─> PopularityModel ─┬─> GameScore ─> BatchPlan
 (data/rateio)│    (data/models)   │                ClosureContract
              ├─> DemandModel ─────┘ (tickets) ──> ValueAssessment
              └─> ForensicTest ──> ForensicGate ──> gerador (inclinação ou não)

Preregistration ──(congela critérios de)──> PopularityModel, DemandModel,
                                           ForensicTest, LabResult
HypothesisStrategy ──> LabResult (Módulo B v2; isolado da geração)
```

## OfficialRules (por modalidade)

Fonte única das regras de prêmio. Arquivo: `web/src/data/rules/official-rules.json`
([contrato](./contracts/official-rules.md)).

| Campo | Tipo | Regra |
|---|---|---|
| `lottery` | `megasena` \| `maismilionaria` | — |
| `rulesVersion` | semver | muda a cada alteração de valor |
| `price` | `{ value, since, source, checkedAt }` | value > 0 |
| `priceEras` | `PriceEra[]` | contíguas, sem sobreposição, a última sem `to` |
| `grossPrizeShare` | `{ value, source, checkedAt }` | 0 < value < 1 (hoje 0,4379) |
| `deductionOrder` | lista de `reserve` \| `fixed` \| `shares` | +Milionária: `reserve, fixed, shares`; Mega: `shares` |
| `tiers` | `PrizeTierRule[]` | da faixa 1 em diante; chaves únicas |
| `accumulations` | `{ kind: 'final05' \| 'virada', share }[]` | só Mega (0,22 e 0,10) |
| `reserve` | `{ share, minTopPrizeNet, overflowCapNet, idleMonths }` | só +Milionária (0,05; 10 mi; 100 mi; 12) |
| `specialContests` | `SpecialContestRule[]` | Virada; outras só com fonte |
| `tax` | `{ rate, exemptionThreshold, source, checkedAt }` | rate 0,30; limite datado |

**Invariantes** (testados): a soma das frações de rateio não passa de 1 sobre
a sua base; o retorno imediato por aposta nunca excede `price × grossPrizeShare`
(conservação, como o `require` de `ExpectedReturn` no Kotlin); a soma das
probabilidades das faixas é a chance de prêmio da modalidade (1/11,39 e
1/2.297,56); todo valor numérico tem `source` e `checkedAt`.

### PrizeTierRule

| Campo | Tipo | Regra |
|---|---|---|
| `index` | inteiro ≥ 1 | número da faixa no regulamento |
| `key` | string estável | ex.: `6`, `6+2`, `6+1/0`, `2+1`; nunca traduzida |
| `numberHits` | 0..6 | — |
| `trevoHits` | conjunto ⊂ {0,1,2} | ausente na Mega; `{1,0}` para "1 ou nenhum" |
| `payout` | `{ kind: 'share', fraction }` \| `{ kind: 'fixed', amount }` | — |
| `noWinner` | `accumulate-same-tier` \| `cascade-next-tier` \| `to-top-next-contest` | Mega: acumula na faixa; +Milionária: 2–5 descem, 6 vai para a faixa 1 seguinte |

### SpecialContestRule

| Campo | Tipo | Regra |
|---|---|---|
| `kind` | `virada` \| outro com fonte | — |
| `detect` | regra de detecção | Virada: último concurso do ano de final 0 ou 5, ou indicador da API |
| `shares` | frações por faixa | Virada: 0,90 / 0,05 / 0,05 |
| `noWinner` | `roll-down` | sem ganhador, desce para a faixa seguinte |

Concurso especial sem regra registrada → `ValueAssessment.availability =
'unavailable'` (FR-020).

## PriceEra

`{ lottery, fromContest, toContest?, price, source }`. Usada para converter
arrecadação em apostas simples equivalentes (research.md, R5). A calibração
usa a era também como efeito fixo.

## ContestOutlook (ao vivo, não persistido)

| Campo | Tipo | Origem |
|---|---|---|
| `lottery`, `lastContest`, `nextContest`, `nextDate` | — | API |
| `lastCollection` | R$ ≥ 0 | `valorArrecadado` |
| `accumulatedNext` | R$ ≥ 0 | `valorAcumuladoProximoConcurso` |
| `accumulatedFinal05` | R$ ≥ 0 | `valorAcumuladoConcurso_0_5` |
| `accumulatedSpecial` | R$ ≥ 0 | `valorAcumuladoConcursoEspecial` |
| `reserveBalance` | R$ ≥ 0 \| ausente | `valorSaldoReservaGarantidora` (só API oficial) |
| `estimatedPrize` | R$ ≥ 0 | `valorEstimadoProximoConcurso` |
| `amountsAreNet` | booleano | definido em research.md, R4 |
| `special` | `SpecialContestRule.kind` \| ausente | detecção + indicador da API |
| `source`, `fetchedAt` | — | `community` \| `official` |

Validação: `nextContest = lastContest + 1`; valores não negativos; ausência de
um campo necessário torna indisponível só a medida que depende dele.

## RateioRecord (histórico embutido)

Arquivo: `web/src/data/rateio/{megasena,maismilionaria}.json`
([contrato](./contracts/rateio-history.md)).

| Campo | Tipo | Regra |
|---|---|---|
| `contest` | inteiro | contíguo desde 1 |
| `date` | ISO | igual ao histórico de dezenas |
| `collection` | R$ \| `null` | `null` quando a fonte traz 0 (Mega antiga): **excluído**, nunca imputado |
| `winners` | inteiro ≥ 0 por faixa | 3 (Mega) ou 10 (+Milionária) |
| `prizes` | R$ por faixa | valor pago por ganhador |
| `order` | dezenas (e trevos) na ordem de extração | permutação do conjunto sorteado |
| `location` | string normalizada | normalização pré-registrada |
| `special` | kind \| ausente | — |

Procedência: `third_party_mirror`, com conferência por amostragem contra a API
oficial registrada no `meta.json` (Princípio IV).

## PopularityModel (artefato de modelo)

Arquivo: `web/src/data/models/popularity.json` ([contrato](./contracts/model-artifacts.md)).

| Campo | Tipo | Regra |
|---|---|---|
| `lottery` | — | um bloco por modalidade |
| `preregistration` | `{ version, commit }` | commit anterior ao download do rateio (guarda no script) |
| `data` | `{ fromContest, toContest, excluded, provenance }` | — |
| `numbers` | `{ features, beta, perNumber, surpriseShare }` | `perNumber` com soma zero; 0 ≤ `surpriseShare` ≤ 1 |
| `trevos` | `{ weights, surpriseShare }` \| `undetectable` | só +Milionária |
| `dispersion` | φ por faixa | > 0 |
| `validation` | métricas por modelo (`uniform`, `heuristic`, `calibrated`) e por parte (`confirmation`, `prospective`) | — |
| `controls` | `{ negativeAdoptionRate, positiveAdoptionRate, simulations }` | obrigatório; ≤ 0,05 e ≥ 0,80 |
| `decision` | `CALIBRATED_ADOPTED` \| `HEURISTIC_KEPT` \| `NO_SUPPORT` | regra de research.md, R7 |
| `fittedAt`, `validUntil` | ISO | — |

**Estados**:

```
DRAFT ──fit──> FITTED ──validate──> VALIDATED{decision} ──(now > validUntil)──> EXPIRED
```

O app usa o artefato só em `VALIDATED`. Em `EXPIRED`, continua usando-o e
sinaliza o vencimento (FR-013). `NO_SUPPORT` desliga a exibição do ganho de
rateio; a geração segue uniforme com seleção aleatória.

## DemandModel (artefato de modelo)

`web/src/data/models/demand.json`: coeficientes (α por era, β, γ, δ),
`preregistration`, `validation` contra a linha de base "arrecadação anterior",
`decision` (`MODEL_ADOPTED` \| `BASELINE_KEPT`), `validUntil`. Mesmos estados
do PopularityModel.

## GameScore

| Campo | Tipo | Regra |
|---|---|---|
| `numbers`, `trevoPair?` | — | jogo válido da modalidade |
| `relativePopularity` | > 0 | π(c) · C(N,6) (× 15 nos trevos); 1 = jogo médio |
| `conditionalGain` | número | via `crowdingFactor` com o número de apostas do concurso |
| `modelDecision` | decisão do PopularityModel em uso | exibida na metodologia |

Invariante: a probabilidade de acerto de qualquer `GameScore` é a
hipergeométrica da modalidade; nenhum campo a altera.

## BatchPlan

| Campo | Tipo | Regra |
|---|---|---|
| `lottery`, `games` | — | sem jogos repetidos |
| `structure` | `disjoint-numbers` \| `complementary-trevos` \| `closure` | — |
| `pAnyPrize` | [0,1] | **exato**, por enumeração (research.md, R10) |
| `cost` | R$ | jogos × preço (ou soma de múltiplas) |
| `expectedReturn` | `{ preTax, postTax }` | por real; igual ao de jogos avulsos, a menos da popularidade |
| `expectedLoss` | R$ | custo − retorno esperado |
| `popularityCost` | número | quanto a disjunção custou em popularidade (fase 5) |
| `gateState` | `ForensicGate.state` | registrado no lote |

## ClosureContract

| Campo | Tipo | Regra |
|---|---|---|
| `pool` | dezenas | 7..15 (Mega), 7..12 (+Milionária) |
| `guarantee` | `{ numbers: t, trevosMin: 0 \| 1 \| 2 }` | só garantias que pagam pelas regras |
| `trevoMode` | `none` \| `colors-3` \| `user-set` | +Milionária |
| `trevoPairs` | duplas | `colors-3`: 3 duplas disjuntas cobrindo os 6 trevos |
| `guaranteedTier` | `PrizeTierRule.key` | — |
| `minPrize` | R$ \| `'rateio'` | fixo quando a faixa é fixa |
| `cost`, `pCondition` | — | `pCondition` hipergeométrica (× trevos quando couber) |
| `verified` | `{ method: 'exhaustive', at }` | obrigatório antes de entregar |
| `evNote` | texto fixo | "não muda o retorno esperado por real" |

## ValueAssessment

| Campo | Tipo | Regra |
|---|---|---|
| `contest`, `tickets` | — | `tickets.source`: `model` \| `lastCollection` \| `user` |
| `returnPerReal` | `{ preTax, postTax }` | — |
| `expectedLossForBatch` | R$ | para o lote em tela |
| `breakEvenAccumulated` | `{ preTax, postTax }` | com o modelo de demanda quando adotado |
| `mandel` | `{ cost, grossReturn, netReturn, ratioGross, ratioNet, breakEvenJackpot }` | — |
| `rollDown` | `{ probability, evContribution }` | só Virada |
| `drivers` | lista explicativa | acumulado, final 0 ou 5, Virada, reserva |
| `availability` | `available` \| `{ unavailable, reason }` | FR-020 |

## HypothesisStrategy e LabResult (Módulo B v2)

`HypothesisStrategy`: `{ id, family: 'A' | 'C' | 'baseline', description,
params, handlesTrevos: true, preregistrationVersion }`. Lista fechada em
research.md, R13.

`LabResult`: `{ strategyId, lottery, selection { meanHits, prizeRate, pRaw,
pAdjusted }, confirmation { …, replicated }, prospective { … }, overfitting? {
inSample, outOfSample, gap, ci } (só família C), verdict: APPROVED |
NOT_APPROVED }`.

Invariante (testada): o gerador não importa nem recebe nenhum `LabResult`
com `verdict = NOT_APPROVED`; a única porta é o Módulo C existente, que exige
aprovação.

## ForensicTest

`{ id: 'A6' … 'A10', lottery, regime: { era, location } , hypothesis,
statistic, pRaw, pCorrected, power, minimumDetectableEffect, verdict, controls
{ negativeRate, positiveRate }, preregistrationVersion }`.

## ForensicGate

```
NO_BIAS (padrão)
  ├─> HISTORICAL_ONLY        viés só em era encerrada        → geração inalterada
  ├─> CURRENT_UNREPLICATED   viés no regime atual, sem réplica → geração inalterada
  └─> CURRENT_REPLICATED     viés no regime atual, replicado  → inclinação limitada
```

Em `CURRENT_REPLICATED`, `tilt` traz pesos por dezena encolhidos (Bayes
empírico, como em `bayesEvidence.ts`) e limitados por um teto pré-registrado,
e `evidence` aponta para os `ForensicTest` que o abriram. O estado volta a
`NO_BIAS` se a replicação falhar numa reavaliação.

## Preregistration

`{ id, version, frozen: { alpha, splits, thresholds, features, … }, commit,
date }`. Os scripts gravam `commit` lendo o git e recusam rodar se o arquivo de
pré-registro tiver alteração não commitada.
