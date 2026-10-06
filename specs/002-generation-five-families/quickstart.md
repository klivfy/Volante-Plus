# Quickstart: validar a feature de ponta a ponta

Roteiro para provar que cada história funciona. Os nomes de arquivo de teste
são os previstos no plano; os valores esperados vêm de
[research.md](./research.md) (marcados com † lá).

## Pré-requisitos

```bash
cd web
npm ci                      # Node 20, o mesmo do netlify.toml
npm run lint && npx tsc --noEmit && npm test   # linha de base verde antes de começar
```

Para a paridade Android: JDK 17 e `./gradlew` na raiz do repositório.

## Fase 0 — pré-registro antes do dado

```bash
git log --format='%H %ad' -- web/src/engine/popularity/preregistration.ts \
  web/src/engine/audit/preregistration.ts web/src/engine/demandModel.ts
node scripts/update-rateio-seed.mjs --check-only   # deve recusar se houver pré-registro não commitado
```

Esperado: os commits de pré-registro são **anteriores** ao commit que adiciona
`web/src/data/rateio/`; `meta.json.preregistrationCommit` aponta para eles.

## US1 — regras oficiais (fase 1)

```bash
npx vitest run src/engine/__tests__/officialRules.test.ts \
               src/engine/__tests__/prizeModel.test.ts \
               src/engine/__tests__/modalityParity.test.ts
./gradlew :app:testDebugUnitTest --tests '*PrizeTableParityTest*'
```

Esperado:

- Chance de prêmio: +Milionária 0,0877961323 (1 em 11,39); Mega 0,0004352441
  (1 em 2.297,56). Faixas: 10 e 3.
- `classifyHits(MAIS_MILIONARIA, 3, 1)` → faixa 8; `(2, 1)` → faixa 10;
  `(4, 0)` → faixa 6; `(3, 0)` → `null`; chamada sem trevo na +Milionária →
  `RangeError`.
- Bolo de rateio da +Milionária: R$ 1,7145 por aposta (reserva antes dos
  fixos); prêmios fixos esperados: R$ 0,7815 por aposta.
- `offeredGuarantees(MAIS_MILIONARIA)` inclui 2 e 3 dezenas com `trevosMin = 1`.
- Kotlin e web iguais nos cenários de referência.

Na tela: selecionar +Milionária → Fechamento → as opções de garantia mostram a
condição de trevos.

## US3 — valor do concurso (fases 2 e 3)

```bash
node scripts/update-rateio-seed.mjs          # baixa, valida, confere amostra oficial
node scripts/fit-demand.mjs                  # controles → dado real → decisão
npx vitest run src/engine/__tests__/contestValue.test.ts
```

Esperado com as fixtures do instantâneo de 2026-10-06 (uniforme, apostas =
arrecadação anterior ÷ R$ 6):

| Cenário | Retorno por real antes / depois do IR | Mandel antes / depois do IR |
|---|---|---|
| Mega 3.067 (R$ 81,4 mi acumulados, 12,45 mi apostas) | 40,1% / 30,1% | 0,56 / 0,41 |
| +Milionária 396 (R$ 100,3 mi, 1,92 mi apostas) | 31,0% / ~26,6% | 0,49 / ~0,38 |
| Mega regular sem acumulado, 12,45 mi apostas | 16,1% / — | — |
| +Milionária sem acumulado (mínimo de R$ 10 mi líquidos) | 24,9% / — | — |

- Virada: retorno por real antes do IR = 0,4379 + (reservas e acumulados da
  Virada ÷ arrecadação da Virada); chance de ninguém acertar a sena, uniforme:
  0,25% com 300 mi de apostas.
- Fixture sem arrecadação → `availability: unavailable`, nenhum número.
- Conferência independente: Monte Carlo do rateio (ganhadores sorteados) bate
  a fórmula fechada dentro do erro de simulação.

Na tela: o painel aparece com o número de apostas estimado; corrigir o número
à mão recalcula tudo; desligar a rede mostra "indisponível" com o motivo.

## US2 — popularidade calibrada (fase 4)

```bash
node scripts/fit-popularity.mjs --controls-only   # negativo ≤ 5%, positivo ≥ 80%; senão aborta
node scripts/fit-popularity.mjs                   # dado real → validação em 3 vias → decisão
npx vitest run src/engine/__tests__/popularity*.test.ts src/engine/__tests__/gameGenerator.test.ts
./gradlew :app:testDebugUnitTest --tests '*PopularityParityTest*'
```

Esperado:

- Soma por polinômios simétricos = força bruta em universos pequenos (ex.:
  N = 12, 6 sorteadas), erro relativo < 1e-12.
- O teste recalcula a `decision` gravada em `popularity.json` a partir das
  métricas e confere.
- Teste de propriedade: distribuição de acertos dos jogos gerados =
  hipergeométrica (e o gerador enviesado de controle falha).
- Dois lotes com a mesma semente são idênticos; sementes diferentes dão jogos
  diferentes (nenhum "jogo único para todos").

O resultado da validação, qualquer que seja, aparece na metodologia (página
Sobre).

## US4 — lote e fechamento (fase 5)

```bash
npx vitest run src/engine/__tests__/batchStructure.test.ts src/engine/__tests__/closureDesigner.test.ts
```

Esperado:

- +Milionária, dezenas disjuntas: 2 jogos 17,25%; 3 jogos 25,42%; 4 jogos
  32,91% de chance de ≥1 prêmio com duplas complementares (contra 17,15% e
  25,11% com duplas independentes).
- Mega, 3 jogos disjuntos: 0,1306% (independentes: 0,1305%).
- Fechamentos da +Milionária em 3 cores: verificação exaustiva passa para
  todos os pools de 7 a 12 dezenas e garantias de 2, 3 e 4 dezenas + 1 trevo;
  um fechamento corrompido de propósito falha a verificação (controle).

## US5 — laboratório (fase 6)

```bash
npx vitest run src/engine/audit/__tests__/moduleB.test.ts
node scripts/run-lab.mjs --lab        # sobre o histórico real, as duas modalidades
```

Esperado: controles (aprovação ≤ 5% sob sorteio honesto simulado; ≥ 80% com o
viés plantado correspondente a cada estratégia); relatório com as 12
estratégias, veredito de cada uma e, para a Família C, dentro × fora da
amostra. Teste de grafo de importação: `gameGenerator.ts` não alcança o
laboratório.

## US6 — forense (fase 7)

```bash
npx vitest run src/engine/audit/__tests__/forensics*.test.ts
node scripts/run-lab.mjs --audit
```

Esperado: cada teste A6–A10 com controle negativo no nível declarado e
positivo ≥ 80% (bola de unidade viciada, mistura fraca, estrato viciado, jogo
de bolas em rodízio, ganhadores injetados); relatório com poder e menor
efeito detectável; `forensicGate` em `NO_BIAS` a menos que haja viés do regime
atual replicado.

## Fechamento de cada PR

```bash
cd web && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Mais a revisão de conteúdo de [contracts/ui-claims.md](./contracts/ui-claims.md)
quando o PR mexe em tela.
