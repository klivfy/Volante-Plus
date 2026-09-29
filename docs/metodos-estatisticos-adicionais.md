# Métodos estatísticos e probabilísticos adicionais

Resultado de uma varredura na literatura por métodos que se somam aos já
existentes (teste z, qui-quadrado, Bonferroni/BH, hipergeométrica, poder,
auditoria A1–A5) sem violar o teto do teorema da invariância descrito em
[`refinamento-estatistico.md`](./refinamento-estatistico.md): **nenhum método
abaixo prevê sorteios**. Eles melhoram a *precisão do que o app afirma* e o
*custo de quem usa fechamento*.

## O que foi adicionado

### 1. Fator de Bayes para uniformidade (`engine/bayesEvidence.ts`)
Um p-valor grande não é evidência a favor do acaso, só ausência de evidência
contra. O fator de Bayes é a única medida que pode dizer "os dados sustentam
uniformidade".

- **Omnibus:** multinomial–Dirichlet simétrica, forma fechada
  `BF10 = Γ(mα)/Γ(n+mα) · ΠΓ(cᵢ+α)/Γ(α) · mⁿ`, com correção do efeito de
  desenho `(N−K)/(N−1)` (as 6 dezenas saem sem reposição).
- **Esparso:** mistura sobre "uma dezena viciada". Cada `BFᵢ` é Beta-binomial
  **exato** (a inclusão de uma dezena em um concurso é Bernoulli(K/N) sob H0),
  sem aproximação. Necessário porque o omnibus dilui uma dezena isolada: com uma
  dezena ~40% acima (≈8 desvios-padrão), o omnibus ainda dava pró-acaso.
- **Sequencial:** com prior fixado antes dos dados, `BF10` a cada concurso é um
  martingale de teste; pela desigualdade de Ville `P(sup BF ≥ 1/a) ≤ a`, então
  pode-se olhar a cada novo sorteio sem inflar o falso-positivo
  (`anytimeP = min(1, 1/BF)`).
- **Bayes empírico:** estima a força do prior dos próprios dados e devolve as
  probabilidades por dezena *encolhidas*. No histórico real da Mega-Sena, o
  "número quente" de 11,7% vira ≈10,6% (esperado: 10,0%): o encolhimento mede
  quanto do desvio é ruído.

### 2. Testes entre concursos (`engine/drawDependence.ts`)
- **Colisão (aniversário):** pares idênticos ~ Poisson(`n(n−1)/(2·C(N,K))`).
  Sinal clássico de dado duplicado ou corrompido.
- **Espectro de sobreposição:** dezenas em comum entre *todos* os pares de
  concursos vs. hipergeométrica exata. p-valor por linha de base simulada,
  porque a estatística é uma U-estatística degenerada e não segue χ².

### 3. Planejamento de aposta (`engine/betPlanning.ts`)
- Chance de a **garantia do fechamento valer** (`P(X ≥ t)`, hipergeométrica):
  com 10 dezenas na Mega-Sena a quadra garantida vale em 0,54% dos concursos
  (1 em 185). Agora aparece ao lado do contrato.
- Chance acumulada de ≥1 sucesso e apostas para atingir uma chance-alvo.

### 4. Fechamentos menores (`engine/closureTables.ts`)
Recozimento simulado (Nurmela–Östergård; `web/scripts/covering-search.mjs`)
substituiu o guloso para pools de 7 a 15 dezenas. Todas as entradas são
reverificadas exaustivamente antes do uso, com o guloso como reserva. A
atribuição posição→dezena é escolhida para minimizar a popularidade, sem custo
na garantia.

| Pool | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|
| Quadra (t=4), antes | 5 | 7 | 12 | 20 | 36 | 51 | 76 | 107 | 143 |
| Quadra (t=4), agora | 5 | 7 | 12 | 20 | 32 | **41** | 66 | 80 | 134 |
| Terno (t=3), antes | 4 | 4 | 8 | 10 | 11 | 15 | 23 | 26 | 33 |
| Terno (t=3), agora | 4 | 4 | 7 | 10 | 11 | 15 | 21 | 25 | 31 |

Só C(12,6,4) = 41 tem otimalidade conferida em fonte
([arXiv 2607.23766](https://arxiv.org/abs/2607.23766): 40 blocos são
impossíveis). Os demais são limites superiores achados por busca, sem prova de
otimalidade e **sem conferência contra a tabela do La Jolla Covering
Repository**, que estava inacessível na geração — podem existir coberturas
menores. O limite inferior de Schönheim está em `schonheimBound`.

## Resultado sobre o histórico real completo

Histórico real desde o concurso 1 até 27/09/2026 (ver [`historico.md`](./historico.md)):
Mega-Sena 3.063 concursos, +Milionária 393. Fonte de terceiros, confirmada contra
um segundo espelho independente (0 divergências), **não** exportação oficial.
Os métodos foram commitados antes de rodar sobre estes dados.

O espelho antigo terminava no concurso 2.797 (Mega) e 199 (+Milionária). Os
**266 e 194 concursos seguintes** são dado fora da amostra: nenhum teste foi
ajustado olhando para eles, então funcionam como replicação.

| Teste | Mega completo (3.063) | Mega só novos (266) | +Milionária (393) | +Milionária só novos (194) |
|---|---|---|---|---|
| Frequência por dezena (Bonferroni) | **1 dezena** (χ² p = 0,006) | compatível (χ² p = 0,78) | compatível (p = 0,12) | compatível (p = 0,18) |
| Bayes omnibus, `log10 BF10` | −18,7 | −5,0 | −4,4 | −1,9 |
| Bayes esparso (uma dezena viciada) | +0,28 | −0,09 | +0,02 | +0,01 |
| Colisão | 0 repetições (λ = 0,094) | 0 | 0 (λ = 0,0003) | 0 |
| Sobreposição, p simulado | 0,018 | 0,36 | 0,28 | 0,43 |
| **Trevos** (frequência / Bayes esparso) | — | — | compatível (χ² p = 0,94) / −0,61 | — |

**A dezena 26 da Mega-Sena.** Com o histórico completo, uma dezena cruza o limite
de Bonferroni por pouco: a **26 saiu 250 vezes contra 306 esperadas** (z = −3,39;
p = 6,97e-4 contra o limite 8,33e-4; p ajustado para as 60 dezenas ≈ 0,042). O
desvio é para **baixo**, já estava em z = −2,94 no espelho antigo e nos 266
concursos novos ela seguiu abaixo (17 contra 26,6 esperadas, z ≈ −1,9, sem
significância isolada).

Como ler isso, sem exagero nem descaso:

- É um resultado **limítrofe**: p familiar de 4%, depois de várias análises
  sobre o mesmo histórico, no qual um desvio assim aparece por acaso com
  frequência não desprezível.
- O fator de Bayes não o corrobora: o omnibus sustenta fortemente a
  uniformidade (−18,7) e o esparso é inconclusivo (+0,28).
- Na mesma direção, mas sem força própria, nos dados novos: **não é replicação
  confirmada**, e o restante (sobreposição, qui-quadrado e Bayes nos concursos
  novos) é totalmente compatível com o acaso.
- Ainda que fosse real, não daria vantagem de previsão utilizável: uma dezena
  ~18% menos frequente altera a chance de um jogo em fração desprezível, e o
  teorema da invariância continua valendo para qualquer jogo escolhido antes do
  sorteio.
- O que resolve é **dado oficial** e mais concursos. O monitoramento sequencial
  (`bayesTrajectory`) fica acompanhando: o p sempre-válido hoje é 0,99.

O painel da tela principal agora mostra qual dezena está fora do acaso e em que
direção, em vez de só uma contagem.

## Considerados e não adicionados
- **Bateria NIST SP 800-22 / Diehard:** projetada para bits de geradores
  criptográficos; não se aplica diretamente a sorteios combinatórios.
- **Ljung-Box / autocorrelação da soma:** já coberto em parte por A2 e A3.
- **Modelos de seleção consciente ajustados (Farrell, Walker, Hartley e
  Lanot; Wang et al.):** a direção do efeito já está em `unpopularity.ts`, mas
  estimar a magnitude exige dados de apostas brasileiras que a Caixa não
  publica.

## Fontes
- Bayes factor contra equiprobabilidade multinomial com Dirichlet simétrica:
  [Ann. Statist.](https://projecteuclid.org/euclid.aos/1176343015) ·
  [Equidistribution Testing with Bayes Factors](https://pubs.aip.org/aip/acp/article-pdf/doi/10.1063/1.4959055/13061491/040001_1_online.pdf)
- Inferência sempre válida, e-values e desigualdade de Ville:
  [Ruf et al., nonnegative martingales](https://arxiv.org/pdf/2009.03167)
- Coberturas: [La Jolla Covering Repository](https://ljcr.dmgordon.org/cover.html) ·
  [Gordon & Stinson, *Coverings*](https://www.dmgordon.org/papers/hcd.pdf) ·
  [C(12,6,4) = 41](https://arxiv.org/abs/2607.23766) ·
  [6/49 e designs combinatórios](https://arxiv.org/pdf/2603.24170)
- Seleção consciente e prêmio rateado: [Number preferences in lotteries](https://www.sas.upenn.edu/~baron/journal/15/151103a/jdm151103a.html)
- Aniversário e aproximação de Poisson:
  [Birthday coincidences and Poisson approximations](https://eventuallyalmosteverywhere.wordpress.com/2015/09/11/birthday-coincidences-and-poisson-approximations/)
- Encolhimento e Bayes empírico: [Empirical Bayes for the Reluctant Frequentist](https://arxiv.org/pdf/2404.03422)
