# Paridade web–Kotlin: testes dourados (Fase 4, frente 1)

> A fonte de verdade matemática das fixtures é
> `web/src/engine/golden/goldenFixture.ts`; este texto explica as regras do
> jogo. As fixtures versionadas vivem em
> `shared/src/commonTest/resources/golden/` — um JSON por modalidade, lido
> pelo teste dourado Kotlin (`GoldenParityTest.kt`) e conferido pelo teste
> anti-deriva da web (`goldenFixtures.test.ts`).

## O que é garantido (e como)

O PR #26 trouxe a Quina ao Android e ao desktop **sem verificação cruzada
automática** contra a implementação web de referência. Os testes dourados
fecham essa lacuna: um conjunto de entradas canônicas (apostas, concursos,
pools de fechamento) e a verdade matemática correspondente, gerados pelo
motor TypeScript e versionados como fixtures JSON — e o motor Kotlin
compartilhado tem de reproduzir a mesma verdade, no mesmo commit, nos dois
alvos JVM (`:app` e `:desktop`).

Três formas de verdade, cada uma com o critério certo:

| Conteúdo da fixture | Critério de paridade |
|---|---|
| Frações exatas de probabilidade por faixa (`numerator`/`denominator` como inteiros, reduzidas por mdc) | **Byte a byte**: recomputadas com `BigInteger` no Kotlin e `BigInt` na web — a forma reduzida de um racional é única |
| Grade de classificação (acertos → faixa), apostas/concursos canônicos, preços, garantias | **Igualdade exata** (inteiros e booleanos) |
| Valores em ponto flutuante do motor | **Nada na fixture**: cada motor confronta o seu próprio double com a fração exata (tolerância relativa 1e-9) |

Por que floats não entram na fixture: os algoritmos das duas plataformas são
deliberadamente diferentes (`logFactorial` acumulado na web, Lanczos
`lnGamma` no Kotlin) e seus últimos bits não têm por que coincidir — exigir
igualdade bit a bit seria testar a sorte do arredondamento, não o motor. O
que as duas verificam é a distância até a verdade exata, que é única.

## Como rodar

```bash
# Regenera/atualiza as fixtures a partir do motor web (gravar + SHA-256)
node scripts/generate-golden-fixtures.mjs

# Confere sem gravar (modo do CI)
node scripts/generate-golden-fixtures.mjs --check

# Lado web: anti-deriva (re-gera e exige igualdade byte a byte)
cd web && npx vitest run src/engine/golden/goldenFixtures.test.ts

# Lado Kotlin: via Gradle no CI (android-ci.yml)
./gradlew :shared:desktopTest

# Lado Kotlin: local, sem Gradle e sem Android SDK
bash scripts/kotlin-golden-check.sh
```

O `scripts/kotlin-golden-check.sh` baixa (uma vez) o compilador Kotlin
2.2.0 e os jars do `kotlinx-serialization` 1.7.3 — as mesmas versões de
`gradle/libs.versions.toml` —, compila os fontes compartilhados relevantes
mais o teste dourado e o executor local (`scripts/kotlin-golden/GoldenMain.kt`)
e roda tudo numa JVM. É a via usada na revisão local, onde não há Android
SDK; o CI valida o MESMO arquivo de teste por `:shared:desktopTest`.

## Verificação negativa

Um teste de paridade só significa alguma coisa se conseguir reprovar. O
controle negativo executado na implementação (sabotar a fração da Sena de
1/50.063.860 para 2/50.063.860 numa cópia da fixture) fez o executor local
reprovar com exatamente as duas divergências esperadas (faixa e soma exata)
e sair com código 1. O teste anti-deriva da web reprova quando alguém muda
o motor sem regenerar as fixtures — ou regenera sem revisar o impacto no
outro lado. **Nunca atualize a fixture esperada sem ler o diff**: ela é
contrato entre plataformas, não snapshot.

## Assimetrias DECLARADAS (não são divergências)

- **Fechamento**: os designs Kotlin são C(v, 6, t) e a UI Kotlin oferece
  fechamento com garantia só para a Mega-Sena (guard no `VolanteViewModel`);
  a web oferece para as três modalidades (Quina via busca gulosa, k = 5).
  Por isso a Quina tem `closureCases` vazio na fixture — e o teste dourado
  falha se alguém prometer fechamento de Quina no Kotlin sem rever os dois
  lados. O que as plataformas comparam nos casos C(10, 6, 3) e C(10, 6, 4)
  é o INVARIANTE (design verificado por exaustão cobre exatamente C(v, t)
  subconjuntos), não o design em si: as tabelas de covering design são
  diferentes por decisão de projeto, e ambas são reverificadas em tempo de
  execução.
- **Garantias oferecidas**: a lista `offeredGuarantees` da fixture reflete a
  regra da web (garantia t só se `t` acertos premiarem a modalidade — na
  Mega-Sena, só quadra). O catálogo Kotlin tem designs para terno e quadra;
  a fixture exige apenas que o que a web oferece exista no Kotlin.

## O que os testes dourados NÃO cobrem

- **Geração de jogos com RNG**: o Kotlin usa `java.util.Random`/`SecureRandom`
  e a web usa mulberry32 — fontes de aleatoriedade diferentes por projeto.
  Comparar lotes gerados seria comparar os PRNGs, não os motores. A paridade
  cobre o determinismo que as duas plataformas compartilham; a aleatoriedade
  é coberta pela calibração (Fases 1–3) no lado web e pelos testes de
  unidade do Kotlin no lado dele.
- **Backtest de ponta a ponta** (pesos, estratégias): depende do RNG acima.
  A base determinística do backtest (classificação, faixas, baseline
  hipergeométrico) é exatamente o que as fixtures fixam.

Declaração de honestidade: nada aqui aumenta a chance de acerto de uma
aposta — os sorteios são eventos aleatórios independentes. Paridade entre
plataformas garante que a mesma pergunta receba a mesma resposta em todas
elas, não que a resposta seja um palpite melhor.
