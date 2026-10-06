# Implementation Plan: Método de geração à luz das cinco famílias de métodos (Mega-Sena e +Milionária)

**Branch**: `002-generation-five-families` (git: `claude/generation-five-families`) | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-generation-five-families/spec.md`

## Summary

O gerador passa a ser um **pipeline em camadas, igual para as duas
modalidades**, em que cada família da taxonomia ocupa o único lugar em que ela
é matematicamente legítima:

```
regras oficiais datadas (fundação)
  → universo uniforme de combinações (dezenas × trevos)   ← teorema da invariância
  → portão forense (E): só um viés do regime atual, replicado, pode inclinar o sorteio
  → candidatos equiprováveis
  → escolha por valor condicional (A ao contrário): popularidade calibrada com
    ganhadores por faixa reais, para dezenas e trevos
  → estrutura do lote (B): chance máxima de ≥1 prêmio pelo mesmo custo e EV;
    fechamentos com contrato completo e garantia com trevos na +Milionária
  → painel de valor do concurso (D): retorno por real, Mandel, roll-down da Virada

laboratório isolado (A popular + C machine learning) → Módulo B v2, pré-registrado,
nas duas modalidades; nada dele chega à geração sem aprovação replicada
```

A ordem de implementação começa pelo que está **errado hoje** e sustenta
todo o resto: a web classifica a +Milionária em 9 faixas que não são as
oficiais (1 em 1.099 de chance de prêmio, em vez de 1 em 11,39), a fração de
prêmio das duas plataformas está desatualizada (43,35% contra 43,79%), o
Android deduz a reserva da +Milionária na ordem errada, e quatro módulos da web
avaliam a +Milionária sem trevos (ver [research.md](./research.md), R1 e R2).

As calibrações (popularidade e demanda) e a bateria forense rodam **offline**,
em scripts Node que gravam artefatos JSON versionados; o app só os consome.
Isso dá paridade web/Android por construção (o mesmo arquivo de dados alimenta
as duas linguagens, com teste de equivalência) e mantém a geração instantânea
no celular.

## Technical Context

**Language/Version**: TypeScript 5 (motor `web/src/engine/`, UI Next.js 16 +
React 19 + MUI 9); Node.js 20 ESM (`web/scripts/*.mjs`) para calibração e
coleta de dados; Kotlin (KMP `shared/`, testes JVM em `app/` e `shared/`) para
paridade.

**Primary Dependencies**: nenhuma nova. A numérica necessária (Newton/IRLS
para modelos lineares generalizados, verossimilhança binomial negativa,
polinômios simétricos elementares, periodograma, enumeração hipergeométrica
multivariada) é implementada no próprio motor, que já é "matemática pura, sem
dependências" e roda em página, service worker e teste
(`web/src/engine/hypergeometric.ts`).

**Storage**: JSON embutido em `web/src/data/` — regras oficiais
(`data/rules/`), histórico de rateio (`data/rateio/`, carregado sob demanda
como o histórico de dezenas) e artefatos de modelo (`data/models/`). IndexedDB
(Dexie, `services/db.ts`) segue guardando os concursos sincronizados; o
panorama do próximo concurso é buscado ao vivo e não é persistido.

**Testing**: Vitest (`npm test`) para motor e scripts; JUnit/JVM
(`./gradlew :app:testDebugUnitTest`) para a paridade Kotlin; Playwright
(`npm run test:e2e`) para os fluxos de tela críticos. Todo instrumento novo
tem controle negativo e positivo (Princípio III); toda fórmula fechada nova tem
conferência independente (enumeração ou Monte Carlo).

**Target Platform**: PWA publicada no Netlify (navegadores móveis e desktop) e
domínio do app Android (`shared/`).

**Project Type**: aplicação web (Next.js) com motor TypeScript puro + pipeline
de dados offline + domínio Kotlin Multiplatform compartilhado.

**Performance Goals**: gerar um lote em menos de 1 s num celular intermediário
(o escore de popularidade fatorado custa O(6) por candidato; 64 candidatos por
jogo); painel de valor em até 2 s depois de o panorama chegar; chance exata de
≥1 prêmio por enumeração em menos de 50 ms para lotes de até 10 jogos e
fechamentos de até 15 dezenas; calibração offline em menos de 5 minutos numa
máquina de desenvolvimento; bateria forense completa (10.000 históricos de
linha de base por teste) fora da thread principal.

**Constraints**: geração funciona offline (modelos embutidos); painel de valor
degrada com aviso, nunca com estimativa inventada; determinismo (sementes
fixas em referência, calibração e linha de base); pré-registro commitado antes
de qualquer análise do dado real correspondente, com guarda nos scripts; testes
sem rede (fixtures); artefatos de modelo pequenos (< 20 KB cada) e histórico de
rateio carregado sob demanda.

**Scale/Scope**: Mega-Sena com ~3.066 concursos (entre ~1.870 e ~2.070 com
arrecadação publicada — ela aparece entre os concursos 1.000 e 1.200, e o ponto
exato é fixado na fase 2), +Milionária com ~395 (todos com arrecadação);
21.465 combinações de quadra por sorteio; modelo de popularidade com algumas
dezenas de parâmetros; Módulo B de 5 para 12 estratégias; 5 testes forenses
novos (A6–A10).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Aplica-se? | Avaliação |
|---|---|---|
| I. Sem alegação preditiva sem evidência replicada (NÃO NEGOCIÁVEL) | **Sim — eixo da feature** | Nenhuma camada do pipeline altera a chance de uma combinação. A popularidade muda o valor condicional a ganhar; a estrutura do lote muda a distribuição pelo mesmo EV; o painel de valor muda a escolha do concurso. Famílias A (como preditor) e C só existem no Módulo B v2, com seleção, confirmação e replicação. O portão forense exige viés no regime atual **e** replicado. `contracts/ui-claims.md` lista frases proibidas e ressalvas obrigatórias. |
| II. Pré-registro antes do dado | **Sim** | A Fase 0 de implementação commita os pré-registros (popularidade, demanda, Módulo B v2, forense A6–A10) **antes** de baixar o histórico de rateio. Os scripts de calibração recusam rodar se os arquivos de pré-registro tiverem alteração não commitada e gravam o hash do commit no artefato. O que foi visto do dado durante este planejamento está declarado em research.md, R16. |
| III. Controles negativo e positivo (NÃO NEGOCIÁVEL) | **Sim** | Cada instrumento novo tem os dois controles, com critérios em SC-006: popularidade (escolha uniforme × efeito do tamanho da literatura), demanda, Módulo B v2 (histórico honesto × viés plantado por estratégia), A6–A10 (defeito físico plantado por teste). Fórmulas novas com conferência independente: soma por polinômios simétricos × força bruta em universo pequeno; EV fechado × Monte Carlo do rateio; chance de ≥1 prêmio × enumeração exaustiva. |
| IV. Procedência e limitações sempre declaradas | **Sim** | Regras com fonte e data; histórico de rateio com procedência `third_party_mirror` e conferência por amostra contra a API oficial; concursos sem arrecadação ficam fora (não são imputados); concurso especial de regra desconhecida → valor indisponível; limite de isenção do IR datado. |
| V. Domínio único compartilhado entre plataformas | **Sim** | Regras e modelos viram **dados** (JSON) lidos pelas duas linguagens, com teste de equivalência no Kotlin. Divergências existentes são corrigidas (fração 43,79%, ordem de dedução da reserva, 9 faixas na web, candidatos 64 × 12 e estratégia padrão diferente entre web e Android). Telas novas no Android ficam fora: ver Complexity Tracking. |
| VI. Ler a documentação antes de codificar | **Sim (UI)** | Antes de mexer em páginas e componentes, ler `web/node_modules/next/dist/docs/` (Next 16, ver `web/AGENTS.md`) e os guias do MUI 9 já usados no projeto. O motor e os scripts não usam API nova. |
| Restrição: honestidade com o usuário | **Sim** | Toda medida derivada aparece com a ressalva no mesmo painel (FR-012, FR-019, FR-025; `contracts/ui-claims.md`). |
| Fluxo de desenvolvimento | **Sim** | Branches `claude/*`, um PR por história (ou fase), teste junto com toda mudança em `web/src/engine/`, documentação no mesmo PR, `CHANGELOG.md` e versão web (2.3.0 → 2.4.0 no primeiro PR que muda comportamento). |

**Resultado**: PASS, com uma justificativa registrada em Complexity Tracking
(telas Android adiadas).

## Project Structure

### Documentation (this feature)

```text
specs/002-generation-five-families/
├── plan.md              # Este arquivo
├── research.md          # Fase 0: decisões, fontes, números conferidos
├── data-model.md        # Fase 1: entidades, validações, estados
├── quickstart.md        # Fase 1: roteiro de validação
├── contracts/
│   ├── official-rules.md     # formato e invariantes do arquivo de regras
│   ├── rateio-history.md     # formato do histórico de rateio embutido
│   ├── model-artifacts.md    # popularity.json e demand.json
│   ├── caixa-api-fields.md   # campos consumidos das duas APIs
│   ├── engine-api.md         # funções públicas do motor usadas pela UI
│   └── ui-claims.md          # o que cada painel mostra e frases proibidas
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks — não criado aqui)
```

### Source Code (repository root)

```text
web/
├── scripts/
│   ├── update-history-seed.mjs        # existente
│   ├── covering-search.mjs            # existente; ganha a busca com trevos (cores)
│   ├── update-rateio-seed.mjs         # NOVO: baixa e valida o histórico de rateio
│   ├── fit-popularity.mjs             # NOVO: calibra e valida a popularidade
│   ├── fit-demand.mjs                 # NOVO: calibra e valida o modelo de demanda
│   └── run-lab.mjs                    # NOVO: Módulo B v2 e forense sobre o histórico real
├── src/
│   ├── data/
│   │   ├── rules/official-rules.json  # NOVO: regras oficiais datadas (fonte única)
│   │   ├── rateio/                    # NOVO: {megasena,maismilionaria}.json + meta.json
│   │   └── models/                    # NOVO: popularity.json, demand.json
│   ├── engine/
│   │   ├── officialRules.ts           # NOVO: carrega e valida as regras
│   │   ├── prizeRules.ts              # CORRIGIDO: 10 faixas da +Milionária
│   │   ├── prizeModel.ts              # NOVO: bolo, reserva, fixos, rateio, repasses, IR
│   │   ├── contestValue.ts            # NOVO: EV por concurso, Mandel, roll-down
│   │   ├── demandModel.ts             # NOVO: apostas previstas a partir do prêmio
│   │   ├── popularity/
│   │   │   ├── model.ts               # NOVO: escore fatorado (dezenas, trevos, Surpresinha)
│   │   │   ├── symmetric.ts           # NOVO: polinômios simétricos elementares
│   │   │   └── preregistration.ts     # NOVO: critérios congelados
│   │   ├── batchStructure.ts          # NOVO: chance exata de ≥1 prêmio, trevos complementares
│   │   ├── unpopularity.ts            # passa a delegar ao modelo adotado
│   │   ├── payoutShare.ts             # usa a popularidade adotada
│   │   ├── gameGenerator.ts           # pipeline em camadas
│   │   ├── closureDesigner.ts         # garantias com trevos, contrato completo
│   │   ├── powerAnalysis.ts           # CORRIGIDO: anyPrizeProbability com as 10 faixas
│   │   ├── strategyBenchmark.ts       # +7 estratégias (A e C), com trevos
│   │   ├── predictors/
│   │   │   ├── logisticFeatures.ts    # NOVO: família C, representante 1
│   │   │   └── markovTransition.ts    # NOVO: família C, representante 2
│   │   └── audit/
│   │       ├── preregistration.ts     # v2: constantes de A6–A10
│   │       ├── moduleB.ts             # v2: estratégias novas, duas modalidades
│   │       ├── forensics/             # NOVO: globeDigits, extractionOrder, strata,
│   │       │                          #       periodicity, winnersAnomaly
│   │       └── gate.ts                # NOVO: decisão do portão forense
│   ├── services/
│   │   ├── caixaApi.ts                # + fetchContestOutlook (arrecadação, acumulados)
│   │   └── rateioSource.ts            # NOVO: carga sob demanda do histórico de rateio
│   ├── components/
│   │   ├── ContestValuePanel.tsx      # NOVO
│   │   ├── BatchSummary.tsx           # NOVO: chance de ≥1 prêmio, custo, perda esperada
│   │   ├── ClosureContract.tsx        # NOVO: contrato completo do fechamento
│   │   └── PayoutSharePanel.tsx       # usa a popularidade adotada
│   └── app/
│       ├── page.tsx                   # painel de valor + resumo do lote
│       ├── analise-avancada/page.tsx  # laboratório e auditoria forense
│       └── sobre/page.tsx             # as cinco famílias, explicadas
└── locales/pt-BR/common.json          # textos novos, com as ressalvas

shared/src/commonMain/kotlin/com/volanteplus/loterias/domain/
├── backtest/PrizeTable.kt             # CORRIGIDO: 43,79%, ordem de dedução
├── generator/Unpopularity.kt          # lê o mesmo popularity.json
└── generator/GameGenerator.kt         # estratégia padrão alinhada à web

app/src/test/java/com/volanteplus/loterias/domain/
├── backtest/PrizeTableParityTest.kt   # NOVO: lê official-rules.json
└── generator/PopularityParityTest.kt  # NOVO: lê popularity.json

scripts/sync-shared-models.mjs         # NOVO: copia regras e modelos para os assets do Android

docs/
├── geracao-cinco-familias.md          # NOVO: o método, família por família
├── refinamento-estatistico.md         # atualizado
└── metodos-estatisticos-adicionais.md # atualizado
```

**Structure Decision**: segue a estrutura existente do monorepo. O motor web
continua sendo TypeScript puro em `web/src/engine/`, com módulos novos ao lado
dos atuais e subpastas só onde há mais de um arquivo coeso (`popularity/`,
`predictors/`, `audit/forensics/`). Regras e modelos saem do código e viram
dados em `web/src/data/`, que é de onde o Android já deriva o seu seed
(feature 001); um script na raiz replica esses arquivos nos assets do Android,
no mesmo padrão de `scripts/generate-android-seed.mjs`.

## Abordagem por fase de implementação

Cada fase é um PR independente. A ordem respeita as dependências; dentro de
cada fase, os testes vêm antes do código que eles cobrem.

| Fase | História | Entrega | Depende de |
|---|---|---|---|
| 0 | — | Pré-registros commitados: popularidade, demanda, Módulo B v2, forense A6–A10, com as simulações de poder que fixam os limiares | — |
| 1 | US1 (P1) | Regras oficiais em JSON; 10 faixas na web; modelo de prêmios; correção das chamadas sem trevo; garantias da +Milionária; paridade Kotlin (43,79%, ordem da reserva) | — |
| 2 | suporte | `update-rateio-seed.mjs` + histórico de rateio embutido; `fetchContestOutlook` | 0 (guarda de pré-registro) |
| 3 | US3 (P2) | Valor do concurso: EV antes e depois do IR, perda esperada, equilíbrio, Mandel, roll-down da Virada, reserva da +Milionária; modelo de demanda validado | 1, 2 |
| 4 | US2 (P1) | Popularidade calibrada e validada (três vias: uniforme × heurística atual × calibrada); integração no gerador, no fechamento e no painel de rateio; trevos | 0, 1, 2 |
| 5 | US4 (P2) | Estrutura do lote (chance exata de ≥1 prêmio, trevos complementares); fechamentos com trevos e contrato completo | 1 (4 para combinar com popularidade) |
| 6 | US5 (P3) | Módulo B v2: estratégias A e C nas duas modalidades, medidor de sobreajuste, tela do laboratório | 0, 1 |
| 7 | US6 (P3) | Forense A6–A10, portão forense, relatório | 0, 2 (A10 usa a popularidade da fase 4) |
| 8 | transversal | Paridade de runtime no Android (modelos nos assets, estratégia padrão), documentação final, CHANGELOG, versão | 1–7 |

A US2 é P1 na spec, mas vem depois da US3 na ordem porque as duas dependem do
histórico de rateio (fase 2) e a calibração exige a guarda de pré-registro
funcionando; a fase 3 é menor e valida o pipeline de dados primeiro. Se o
prazo apertar, as fases 1, 2 e 4 formam o MVP: regras certas e escolha de jogos
com popularidade medida no Brasil.

### Decisões de desenho que a implementação deve preservar

1. **A chance nunca muda.** Todo candidato vem de amostragem uniforme sobre o
   universo (ou o pool do fechamento). Popularidade, estrutura e valor só
   escolhem **entre** candidatos equiprováveis. Um teste de propriedade
   verifica que a distribuição de acertos dos jogos gerados é a
   hipergeométrica exata (qui-quadrado sobre 100 mil jogos, com controle).
2. **Popularidade fatorada.** π(c) = s·u + (1−s)·∏wᵢ/e₆(w): escore O(6) por
   candidato, soma exata por faixa via polinômios simétricos elementares
   (research.md, R6). Padrões que quebram a fatoração (sequências, alinhamento
   no volante) entram num segundo estágio, por amostragem por importância, só
   se o primeiro passar.
3. **Validação em três vias.** Uniforme × heurística atual × calibrada, fora
   da amostra e em concursos posteriores ao pré-registro. O resultado decide
   entre três estados publicados: calibrada adotada; heurística mantida (agora
   validada); nenhuma das duas supera a escolha uniforme (o app deixa de
   exibir ganho de rateio e explica o porquê).
4. **EV por conservação.** Onde o bolo é sempre pago no próprio concurso
   (faixas inferiores, Virada), o retorno médio por aposta sai por conservação
   (bolo ÷ apostas), sem modelar ganhadores; só a faixa que acumula usa
   `1 − (1 − p)^N`. Isso elimina uma classe inteira de erro.
5. **Garantia com trevos por cores.** Na +Milionária, a garantia "t dezenas +
   ≥1 trevo" usa um fechamento repetido em 3 cores (duplas disjuntas que cobrem
   os 6 trevos). É verificado exaustivamente; coberturas coloridas menores
   achadas por busca entram só depois da mesma verificação.
6. **Portão forense com regime.** Só testes no regime atual de equipamento
   (globo único, local atual) podem abrir o portão; eras encerradas aparecem no
   relatório e nunca mudam a geração.

## Re-avaliação da Constitution Check (pós-desenho)

Refeita depois de research.md, data-model.md e contracts/:

- **I**: mantido. `engine-api.md` não expõe nenhuma função que devolva
  "probabilidade de ganhar" diferente da hipergeométrica; `ui-claims.md`
  proíbe expressamente "aumenta a chance", "mais chance", "números quentes
  para ganhar" e equivalentes, e exige a ressalva no mesmo painel.
- **II**: mantido e reforçado pela guarda nos scripts (`model-artifacts.md`
  exige `preregistration.commit` em todo artefato).
- **III**: cada entidade de instrumento em `data-model.md` tem os campos de
  controle (`negativeControl`, `positiveControl`) obrigatórios para o
  artefato ser aceito.
- **IV**: `rateio-history.md` e `model-artifacts.md` carregam `provenance`,
  período e exclusões; `official-rules.md` exige `source` e `checkedAt` em
  todo valor.
- **V**: `official-rules.json` e `popularity.json` são a fonte única; os
  testes de paridade leem os mesmos arquivos.
- **VI**: sem mudança.

**Resultado**: PASS.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Telas novas (painel de valor, laboratório, forense) só na web nesta feature, embora o domínio seja compartilhado (Princípio V) | O produto publicado é a web; o domínio de prêmios e a popularidade ficam em paridade por dados compartilhados e testados, que é o que o Princípio V exige | Implementar todas as telas nas duas plataformas dobraria o escopo; adiar a paridade de **domínio** violaria o Princípio V — por isso o domínio entra aqui e só a UI fica para a próxima feature |
| Histórico de rateio embutido (centenas de KB a mais) | Calibração e auditoria reprodutíveis e offline, como o histórico de dezenas | Buscar só em runtime tornaria a auditoria dependente de rede e não reprodutível; o arquivo é carregado sob demanda, fora do bundle inicial |
| Quatro pré-registros e uma versão maior do Módulo B | Princípio II: cada instrumento novo precisa de critério datado antes do dado | Um pré-registro único misturaria instrumentos com dados e prazos diferentes e obrigaria a reabrir tudo a cada mudança |
