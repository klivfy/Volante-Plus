# Refinamento da base matemática e estatística — Volante+

Análise da base de cálculo atual do app e desenho do refinamento para obter
**maior precisão nos resultados gerados**.

> **Conclusão executiva:** a precisão da *previsão* não pode ser aumentada — isso
> é um teorema, não uma limitação da implementação. O que pode (e deve) ser
> refinado, com ganho grande e mensurável, é a **precisão do instrumento de
> medição** — o motor de backtesting — que hoje produz números com ruído maior
> que qualquer efeito que se proponha a detectar. Além disso, existem **dois**
> pontos onde otimização matemática real é possível e ainda não é explorada:
> coberturas combinatórias e valor esperado do prêmio.

---

## 1. O teto matemático: o teorema da invariância

Antes de propor qualquer refinamento, é preciso estabelecer o que é
matematicamente possível.

Seja `D` o conjunto das 6 dezenas sorteadas em um concurso futuro e `G` um jogo
de 6 dezenas escolhido **antes** do sorteio. O número de acertos é `|G ∩ D|`,
que segue a distribuição hipergeométrica. Sua esperança é:

\[
E[|G \cap D|] = \frac{k \cdot n}{N} = \frac{6 \times 6}{60} = 0{,}60
\]

O ponto decisivo: **esse valor não depende de `G`**. Ele é idêntico para as
dezenas "mais quentes", para as "mais frias", para `{1,2,3,4,5,6}` e para
qualquer RNG. Como os sorteios são independentes e uniformes sobre as
\(\binom{60}{6} = 50.063.860\) combinações, nenhuma informação do histórico
altera a distribuição do próximo sorteio.

Distribuição exata na Mega-Sena (jogo simples):

| Acertos | Probabilidade | 1 em |
|---|---|---|
| 0 | 0,5158844 | 2 |
| 1 | 0,3790171 | 3 |
| 2 | 0,0947543 | 11 |
| 3 | 0,0099089 | 101 |
| 4 (quadra) | 0,00042875 | 2.332 |
| 5 (quina) | 0,00000647 | 154.518 |
| 6 (sena) | 0,00000002 | 50.063.860 |

\(E = 0{,}600\), \(\mathrm{Var} = 0{,}494237\), \(DP = 0{,}703020\).
P(prêmio ≥ quadra) = 0,00043524 → **1 em 2.298 apostas**.

Na +Milionária (N=50): \(E = 0{,}720\), \(DP = 0{,}754286\),
P(prêmio em alguma das 10 faixas) = 0,0102 → **1 em 98 apostas**.

**Implicação de projeto:** o `expectedMeanHits` do relatório não é apenas um
"baseline de comparação" — é o valor que *toda* estratégia obtém em esperança.
Qualquer desvio observado é ruído amostral. O app já acerta ao se posicionar
como laboratório de refutação; o refinamento deve tornar essa refutação
**estatisticamente conclusiva**, em vez de meramente sugestiva.

---

## 2. Diagnóstico: quatro falhas de precisão no motor atual

### 2.1 Jogos do mesmo lote não são independentes — a variância reportada é inválida

`BacktestEngine` acumula todos os acertos em `hitsPerGame` e chama
`Statistics.of(...)`, que calcula a variância populacional tratando cada jogo
como uma observação independente. Mas a regra de "repetição mínima" do
`GameGenerator` torna os jogos de um lote **disjuntos por construção**, o que
induz covariância negativa forte.

Demonstração (200.000 simulações, lote de 10 jogos na Mega-Sena):

| Métrica | Valor observado | Se fossem independentes |
|---|---|---|
| Soma de acertos do lote | **exatamente 6, sempre** (variância 0) | Var = 10 × 0,494 = 4,94 |
| Média por jogo | 0,600 | 0,600 |
| Covariância entre pares | **−0,0549** | 0 |

Com 10 jogos disjuntos cobrindo as 60 dezenas, a soma dos acertos do lote é
uma constante determinística igual a 6 — as 6 dezenas sorteadas caem
necessariamente em algum dos jogos. A "variância" que o relatório exibe hoje
mistura variabilidade real com um artefato do desenho do lote.

**Consequência:** desvio padrão, e qualquer intervalo de confiança derivado
dele, estão sistematicamente errados. O tamanho de amostra efetivo é muito
menor que `totalGames`.

### 2.2 Poder estatístico insuficiente por ordens de magnitude

Tamanho de amostra necessário para detectar um desvio na média de acertos
(α = 5%, poder = 80%, DP = 0,703):

| Efeito a detectar | Jogos necessários |
|---|---|
| +0,30 acerto/jogo | 43 |
| +0,10 acerto/jogo | 387 |
| +0,05 acerto/jogo | 1.550 |
| +0,02 acerto/jogo | 9.687 |
| +0,01 acerto/jogo | 38.748 |

Precisão da média observada:

| Amostra | Erro padrão | IC 95% |
|---|---|---|
| 60 jogos | 0,0908 | 0,600 ± 0,178 |
| 500 jogos | 0,0314 | 0,600 ± 0,062 |
| 5.000 jogos | 0,0099 | 0,600 ± 0,020 |

Um backtest típico de 20 concursos × 3 jogos = 60 jogos produz um intervalo de
±0,18 em torno de 0,60 — largo demais para distinguir qualquer estratégia real.

A situação da **taxa de premiação** é bem pior, porque o evento é raro:

| Cenário | Apostas | Prêmios esperados |
|---|---|---|
| 20 concursos × 3 jogos | 60 | 0,026 |
| 100 concursos × 5 jogos | 500 | 0,218 |
| 500 concursos × 10 jogos | 5.000 | 2,18 |
| Histórico completo (~2.900) × 10 | 29.000 | 12,6 |

O `prizeRate` do relatório é quase sempre **exatamente 0** — não porque a
estratégia falhou, mas porque não há eventos suficientes para estimar nada.
Comparar duas estratégias por essa métrica é comparar dois zeros.

### 2.3 Uma única replicação de Monte Carlo confunde ruído com sinal

`BacktestEngine.run` executa **uma** passada do gerador. O resultado carrega
todo o ruído do RNG. Duas execuções da mesma estratégia com sementes
diferentes produzem números diferentes, e nada no relatório informa quanto
dessa diferença é ruído.

| Replicações de 60 jogos | Erro padrão da média |
|---|---|
| 1 | 0,09076 |
| 30 | 0,01657 |
| 200 | 0,00642 |
| 1.000 | 0,00287 |

Esse ruído é **redutível** (é do simulador, não da loteria) e hoje não é
reduzido nem quantificado.

### 2.4 Ausência de teste de hipótese formal

O relatório entrega estatísticas descritivas e deixa a conclusão a cargo da
leitura visual do usuário — exatamente o mecanismo cognitivo que produz a
crença em "números quentes". Um laboratório de refutação precisa entregar um
veredito com erro controlado: estatística de teste, valor-p, intervalo de
confiança e correção para múltiplas comparações.

---

## 3. Refinamento proposto

### 3.1 Substituir simulação por cálculo exato onde há forma fechada

Para `RANDOM` e `BALANCED`, a distribuição dos acertos é conhecida
analiticamente. Não há motivo para estimá-la por simulação: o valor exato tem
**erro zero**, contra ±0,18 da estimativa atual.

```kotlin
/** Distribuição hipergeométrica exata dos acertos de um jogo. */
object Hypergeometric {
    fun pmf(N: Int, K: Int, n: Int, k: Int): Double =
        binom(K, k) * binom(N - K, n - k) / binom(N, n)

    fun mean(N: Int, K: Int, n: Int): Double = K.toDouble() * n / N

    fun variance(N: Int, K: Int, n: Int): Double =
        n.toDouble() * (K.toDouble() / N) * (1 - K.toDouble() / N) *
            (N - n).toDouble() / (N - 1)
}
```

O relatório passa a exibir a distribuição teórica **ao lado** da observada,
permitindo comparação direta faixa a faixa.

### 3.2 Corrigir a unidade de análise: o lote, não o jogo

Como os jogos de um lote são dependentes, a unidade estatística independente
correta é o **concurso** (um lote por concurso da janela de validação). As
estatísticas devem ser calculadas sobre a série de `validationDraws`
observações independentes, não sobre `totalGames`.

```kotlin
data class ContestOutcome(
    val contestNumber: Int,
    val hitsPerGame: List<Int>,   // dependentes entre si — não agregar como i.i.d.
    val batchTotalHits: Int,       // soma do lote: a observação independente
    val prizedBets: Int,
)
```

`Statistics` passa a receber a série por concurso, e o `n` efetivo do relatório
passa a ser `validationDraws`. Isso torna o erro padrão honesto — e deixa
visível que janelas curtas não sustentam conclusão nenhuma.

### 3.3 Estimador com replicações e decomposição de variância

```kotlin
data class BacktestConfig(
    /* ... campos atuais ... */
    /** Replicações de Monte Carlo; separa ruído do simulador do efeito real. */
    val replications: Int = 200,
)

data class VarianceDecomposition(
    /** Variância intrínseca da loteria — irredutível. */
    val intrinsic: Double,
    /** Variância do simulador — cai com 1/replications. */
    val monteCarlo: Double,
)
```

O motor executa `replications` passadas independentes, reporta a média das
médias e o erro padrão **entre** replicações. O usuário passa a ver
explicitamente qual parte da variação é da loteria e qual é do próprio método.

### 3.4 Veredito estatístico formal

```kotlin
data class HypothesisTest(
    val observedMean: Double,
    val theoreticalMean: Double,
    val standardError: Double,
    val zScore: Double,
    val pValue: Double,
    val confidenceInterval: ClosedFloatingPointRange<Double>,
    /** Poder do teste para o efeito mínimo de interesse. */
    val power: Double,
    /** Menor efeito detectável com o n disponível. */
    val minimumDetectableEffect: Double,
    val verdict: Verdict,
)

enum class Verdict(val label: String) {
    NAO_REFUTA_ALEATORIEDADE("Compatível com o acaso"),
    DESVIO_SIGNIFICATIVO("Desvio estatisticamente significativo"),
    AMOSTRA_INSUFICIENTE("Amostra insuficiente para concluir"),
}
```

Dois testes complementares:

- **Teste z sobre a média** de acertos por concurso, contra o valor teórico exato.
- **Qui-quadrado de aderência** da distribuição observada de acertos (0..6)
  contra a hipergeométrica exata — mais sensível que a média isolada, pois
  detecta desvios na forma da distribuição, não só no centro.

Correção de **Bonferroni** quando o usuário compara as 3 estratégias
(α ajustado de 0,05 para 0,0167), evitando falso positivo por comparação
múltipla.

O estado `AMOSTRA_INSUFICIENTE` é o mais importante do ponto de vista de
honestidade: quando o poder é baixo, o app deve dizer isso, em vez de exibir
um `prizeRate` de 0,000 que parece um resultado.

### 3.5 Métrica de eficácia robusta a eventos raros

Como o prêmio é raro demais para estimar diretamente em janelas curtas,
substituir o `prizeRate` cru por:

- **Prêmios esperados** \(= n \times p_{\text{teórico}}\), sempre exibido ao
  lado do observado, para contextualizar o zero.
- **Intervalo de Wilson** em vez de proporção simples — correto para
  proporções próximas de 0 (a proporção simples produz IC degenerado).
- **Retorno esperado por aposta** em valor monetário, usando as faixas de
  `PrizeRules` ponderadas pelas probabilidades exatas — métrica com variância
  muito menor que a contagem de prêmios.

---

## 4. Onde existe otimização matemática real

Duas frentes onde a matemática **realmente** melhora o resultado — e que o app
ainda não explora.

### 4.1 Fechamento por cobertura combinatória (ganho concreto e verificável)

O modo Fechamento atual apenas desdobra as dezenas marcadas com "repetição
mínima". Isso **não oferece garantia alguma**.

Verificação com pool de 10 dezenas e 5 jogos (o cenário do próprio teste do
repositório): em **300 de 300** tentativas existe ao menos um conjunto de 4
dezenas do pool que nenhum jogo captura. Ou seja: o usuário pode acertar 4 das
10 dezenas que marcou e **não ganhar nada**.

Um fechamento correto é um **covering design** \(C(v,k,t)\). Para o mesmo pool
de 10 dezenas, uma cobertura \(C(10,6,4)\) com **23 jogos** garante
matematicamente a quadra sempre que 4 das 10 dezenas marcadas saírem
(verificado por busca exaustiva: pior caso = 4 acertos).

| Abordagem | Jogos | Garantia se 4 das 10 saírem |
|---|---|---|
| Repetição mínima (atual) | 5 | **nenhuma** |
| Cobertura \(C(10,6,4)\) | 23 | **quadra garantida** |

Este é um ganho de precisão **determinístico e demonstrável** — não estatístico.
Não aumenta a chance de acertar as dezenas, mas garante a conversão de acertos
em prêmio, que é exatamente o que o usuário de fechamento espera comprar.

Proposta: `ClosureDesigner` com coberturas pré-computadas para os pools mais
usados, exibindo ao usuário o contrato explícito — "23 jogos, quadra garantida
se 4 das suas 10 dezenas saírem" — e o custo correspondente.

### 4.2 Valor esperado do prêmio: evitar combinações populares

A probabilidade de ganhar é invariante, mas o **valor** do prêmio não é: prêmios
são rateados entre os ganhadores. Combinações populares (datas de nascimento,
que concentram 1–31; sequências; padrões geométricos do volante) são jogadas
por muitas pessoas simultaneamente. Escolher combinações impopulares não altera
a probabilidade de ganhar, mas **aumenta o valor esperado** condicionado a
ganhar, por reduzir o número esperado de rateios.

Proposta: estratégia `UNPOPULAR`, que penaliza dezenas ≤ 31, sequências
consecutivas e padrões visuais do volante — apresentada com a descrição
honesta: *"não aumenta sua chance de ganhar; aumenta quanto você receberia se
ganhasse"*. É a única "otimização" do app com fundamento matemático sólido para
o retorno.

---

## 5. Plano de implementação

| # | Entrega | Arquivos | Impacto na precisão |
|---|---|---|---|
| 1 | `Hypergeometric` com pmf/média/variância exatas | novo em `domain/backtest/` | Baseline com erro zero |
| 2 | Unidade de análise por concurso | `BacktestEngine`, `Statistics` | Corrige variância inválida (§2.1) |
| 3 | Replicações + decomposição de variância | `BacktestConfig`, `BacktestEngine` | Reduz ruído em ~14× (200 reps) |
| 4 | Teste z + qui-quadrado + IC + poder | novo `HypothesisTest` | Veredito conclusivo |
| 5 | Wilson + prêmios esperados + retorno esperado | `BacktestReport`, `PrizeRules` | Métrica estável em eventos raros |
| 6 | `ClosureDesigner` (covering designs) | `domain/generator/` | Garantia determinística (§4.1) |
| 7 | Estratégia `UNPOPULAR` | `Generation.kt`, `GameGenerator` | Ganho real em valor esperado |

Ordem sugerida: **1 → 2 → 4** entregam o maior ganho de rigor com o menor
esforço; **6** é o maior ganho percebido pelo usuário final.

### Critérios de aceite

- Baseline teórico bate com a tabela da §1 com tolerância 1e-9.
- Backtest de `RANDOM` com n grande **não** rejeita a hipótese nula (α = 5%) —
  se rejeitar, há viés no gerador.
- Backtest de `FREQUENCY` sobre o histórico completo **não** apresenta desvio
  significativo — a refutação empírica que é a missão declarada do app.
- Fechamento por cobertura passa em verificação exaustiva do pior caso.

---

## 6. Nota de honestidade metodológica

O maior mérito do Volante+ é o posicionamento declarado no README: *"Sem
palpite, sem número quente"*. O refinamento acima preserva e reforça esse
compromisso — nenhuma das mudanças aumenta a chance de acerto, porque isso é
matematicamente impossível. O que elas fazem é:

1. tornar o instrumento de medição **preciso o suficiente para de fato refutar**
   as hipóteses que o app se propõe a testar;
2. impedir que ruído amostral seja lido como padrão;
3. entregar, no modo Fechamento, uma **garantia matemática real** no lugar de
   uma promessa vaga;
4. explicitar o único eixo genuinamente otimizável — o valor esperado do prêmio.

Um app de loteria que informa "amostra insuficiente para concluir" quando é o
caso é mais rigoroso — e mais útil — do que um que exibe três casas decimais de
uma taxa estimada sobre zero eventos.

---

### Fontes dos números

Todos os valores de distribuição, poder estatístico, covariância e cobertura
foram calculados a partir das regras implementadas no próprio repositório
(`Lottery.kt`, `Draw.kt`, `GameGenerator.kt`, `PrizeRules.kt`,
`BacktestEngine.kt`), por avaliação exata da hipergeométrica, simulação de
200.000 lotes e busca exaustiva sobre os \(\binom{10}{4} = 210\) quartetos do
pool de fechamento.
