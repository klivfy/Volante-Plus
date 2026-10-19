# Estudo: precisão na geração de números — teto teórico, avenidas e roadmap

**Data**: 2026-10-18
**Escopo**: Mega-Sena e +Milionária; web, Android e desktop.
**Pergunta**: como gerar números "mais precisos" de forma defensável.

> **Resposta curta, antes de tudo**: sob sorteio honesto, nenhuma dezena tem
> chance maior que outra — o teorema da invariância. "Precisão" só existe em
> cinco eixos mensuráveis: (1) valor condicional a ganhar (menos disputa),
> (2) estrutura do lote (probabilidade de ≥1 prêmio/custo), (3) eficiência de
> fechamentos (custo por garantia), (4) escolha do concurso (valor esperado por
> real) e (5) detecção de viés no equipamento (a **única** porta para mudar a
> probabilidade). Este estudo quantifica cada avenida e propõe a ordem de
> ataque.

---

## Sumário executivo

1. **A chance de acertar é intocável** e o app está correto ao não prometê-la.
   O piso de detecção de viés no histórico atual é de **~15% de desvio relativo
   por dezena na Mega-Sena** (3,3σ) e **~36% na +Milionária** — ou seja, só um
   vício grosseiro seria detectável. Nenhuma "previsão" é possível.
2. **A única otimização real está no valor condicional**: jogar combinações
   menos apostadas. O ganho medido é **+6,7%** (20 M apostas), mas ele **depende
   do tamanho do concurso**: +0,34% com 1 M apostas, +15,8% com 50 M, +28,5%
   com 100 M. O número não é uma constante.
3. **A calibração brasileira é viável e identificável**: a quadra da Mega
   fornece ~8.575 ganhadores por concurso de 20 M apostas (ruído de 93); um
   efeito de 1% tem S/N de 0,93 por concurso e ~40 acumulado em 1.900 concursos.
   Na +Milionária, a faixa 10 (2+1) dá S/N de **5,85 por concurso**; em ~600
   concursos, S/N ≈ 143. É a avenida com melhor relação sinal/ruído.
4. **A disjunção absoluta de dezenas custa ~8,3% do único ganho real**:
   popularidade média 0,6590 (disjunto) contra 0,6045 (relaxado); o ganho
   condicional subiria de ~6,7% para ~7,8%. Na Mega, a perda de P(≥1 prêmio)
   do relaxamento é desprezível (~0,005 pp em 4 jogos, dentro do ruído).
   Vale oferecer como opção, não impor.
5. **Trevos complementares só pagam a partir de 3 jogos**: 3 jogos 25,42%
   (vs 25,11% independentes) e 4 jogos 32,91% (vs 32,62%). Com **2 jogos o
   ganho está dentro do ruído** (~0,2 pp); não se deve prometer ganho nesse
   tamanho.
6. **O maior ganho de valor por real não está nos números, e sim no concurso**:
   cada R$ 100 M acumulados valem +R$ 1,65 por aposta de R$ 6 com 20 M apostas
   (e +R$ 0,49 com 200 M). O acumulado de equilíbrio (só sena) é R$ 364 M com
   20 M apostas, mas sobe para **R$ 1,22 bi** com 200 M — a resposta da demanda
   (mais apostas quando o prêmio sobe) é o que impede o cenário Mandel no Brasil.
7. **O web ainda exibe a chance errada na +Milionária** (1 em 1.099, 9 faixas)
   e precisa da correção da spec 002 US-001 antes de qualquer número de rateio
   dessa modalidade ser confiável. É o item de maior prioridade **não** pelo
   ganho, mas pela correção.
8. **Fechamentos**: a garantia já é exata (verificação exaustiva); o que falta
   é custo. Seis dos 18 tamanhos usam mais jogos que o melhor limite conhecido
   (ex.: C(12,6,4) com 50 contra 41 = 22% mais caro), e a garantia com trevos
   da +Milionária (3 cores) ainda não existe.
9. **Machine learning e frequência continuam fora da geração**: o piso de
   detecção de 15% torna qualquer efeito pequeno indistinguível do ruído; o
   laboratório (spec 002 US-005) é o lugar correto para medi-los e refutá-los.
10. **Ordem recomendada**: (i) corrigir faixas no web; (ii) ingestão de
    ganhadores/arrecadação; (iii) objetivo por faixa + disjunção configurável;
    (iv) calibração (spec 003); (v) painel de timing com modelo de demanda;
    (vi) fechamentos menores; (vii) bateria forense.

---

## 1. O teto teórico: o que "precisão" pode significar

| Eixo | O que muda | O que **não** muda | Evidência |
|---|---|---|---|
| Probabilidade de acertar | nada, salvo viés replicado do equipamento | P(faixa) por aposta | Hipergeométrica; auditoria forense |
| Valor esperado incondicional | fração legal da arrecadação (43,79%) e regras de acúmulo | retorno por real no longo prazo | Norma + `PrizeTable` |
| **Valor condicional a ganhar** | combinações menos disputadas | probabilidade | `PayoutShare`, `Unpopularity` |
| **Estrutura do lote** | P(≥1 prêmio) a custo fixo | retorno esperado por real | Covering/complementaridade |
| **Custo do fechamento** | menos jogos para a mesma garantia | garantia (verificada) | Covering designs |
| **Escolha do concurso** | acúmulos, finais 0/5, Virada | chance por aposta | Regras oficiais + demanda |
| Previsão de dezenas | — | — | Refutada; piso de detecção |

O erro clássico — e o que o app evita — é vender o eixo 3 como se fosse o
eixo 1. Todo número deste estudo é condicional a ganhar ou estrutural; nenhum
aumenta a chance.

---

## 2. Estado atual após as melhorias já implementadas

| Item | Status | Onde |
|---|---|---|
| Sorteio uniforme padrão + desempate por popularidade | implementado | `shared/.../GameGenerator.kt`, `web/src/engine/gameGenerator.ts` |
| 12 candidatos medidos (web e Android) | implementado | constantes com tabela de medição |
| Trevos complementares por lote (+Milionária) | implementado | `assignBatchTrevoDuplas` / `assignBatchTrevoDuplas` |
| Recência na popularidade (peso conservador) | implementado | `Unpopularity` / `unpopularity.ts` |
| Fechamento com garantia verificada (Android/desktop) | implementado | `ClosureDesigner` |
| Calibração brasileira de popularidade | **spec 003 (draft)** | `specs/003-popularity-calibration/` |
| Objetivo por faixa de rateio | **pendente** | este estudo, §4.3 |
| Faixas corretas da +Milionária no web | **pendente (bug)** | spec 002 US-001 |
| Ingestão de ganhadores/arrecadação | **pendente** | §8.1 |
| Painel de valor do concurso/timing | **spec 002 US-003** | §6 |
| Fechamentos com trevos e tabelas menores | **spec 002 FR-026 / R11** | §5 |
| Bateria forense | **spec 002 US-006** | §7 |

---

## 3. Avenida A — Calibração brasileira da popularidade

### 3.1 O modelo (spec 002 R6, refinado na spec 003)

Mistura de Surpresinha e escolha enviesada:

```
π(c) = s · 1/C(N,6) + (1−s) · ∏_{i∈c} wᵢ / e₆(w)
log wᵢ = β·xᵢ + bᵢ
```

`xᵢ` são atributos pré-registrados (≤31, ≤12, primo, 7, múltiplos de 5/10,
linha/coluna, distância ao centro); `bᵢ` é efeito próprio com penalidade ridge
e soma zero; `s` é a fração de apostas aleatórias. Ganhadores da faixa k:

```
Λ_tk = N_t · ρ_era · [s·P_k + (1−s)·e_k(w_D)·e_{6−k}(w_D̄)/e₆(w)]
```

Verossimilhança binomial negativa (sobredispersão de múltiplas/bolões).
Identificação: a média sobre sorteios possíveis de Σπ(c) é P_k, então ρ_era
absorve erro de preço e a variação **entre** concursos identifica `w`.

### 3.2 Poder estatístico (medição deste estudo)

S/N de um efeito de 1% por concurso e acumulado no histórico útil:

| Faixa (Mega) | Ganhadores/concurso (N=20 M) | Ruído (σ) | S/N por concurso | S/N em 1.900 concursos |
|---|---|---|---|---|
| Sena | 0,4 | 0,6 | 0,01 | 0,3 |
| Quina | 129 | 11,4 | 0,11 | 5,0 |
| **Quadra** | **8.575** | **92,6** | **0,93** | **40,4** |

| Faixa (+Milionária) | Ganhadores/concurso (N=5 M) | Ruído | S/N por concurso | S/N em 600 concursos |
|---|---|---|---|---|
| **10 (2+1)** | **341.712** | **585** | **5,85** | **143** |
| 9 (2+2) | 42.714 | 207 | 2,07 | 51 |
| 8 (3+1) | 44.450 | 211 | 2,11 | 52 |
| 7 (3+2) | 5.556 | 75 | 0,75 | 18 |
| 6 (4+1/0) | 4.167 | 65 | 0,65 | 16 |
| 5 (4+2) | 298 | 17 | 0,17 | 4 |

**Conclusão**: a quadra da Mega e as faixas 8–10 da +Milionária carregam o
sinal; sena e faixas altas não servem para calibrar. A +Milionária é o melhor
laboratório brasileiro de popularidade, ironicamente porque suas faixas baixas
são fixas e frequentes.

### 3.3 Validação (spec 002 R7)

Três modelos competem fora da amostra: uniforme, heurística atual e calibrada.
Treino até o quantil 80% cronológico, confirmação nos 20% finais, prospectivo
em ≥30 concursos da Mega e ≥15 da +Milionária após o pré-registro. Métrica:
deviance binomial negativa média por concurso, pareada; decisão: adotar a
calibrada só se superar a heurística e a uniforme nas duas janelas; se nada
superar a uniforme, **o app deixa de exibir ganho de rateio** e explica.

### 3.4 Riscos e mitigação

| Risco | Efeito | Mitigação |
|---|---|---|
| Efeito manada | os jogos "impopulares" recomendados deixam de ser | escolha aleatória entre candidatos (já implementada) + recalibração periódica |
| Deriva temporal do comportamento | calibração vencida | validade datada, versão, sinalização (FR-013) |
| Má especificação do modelo | ganho superestimado | validação pré-registrada + controles negativo/positivo (R7) |
| Dados de ganhadores incompletos | viés de seleção | só concursos com arrecadação publicada; declarar exclusões |
| Preço/era | N_t mal estimado | efeito fixo por era de preço (R5) |

**Ganho esperado**: substitui a magnitude heurística por estimativa com
intervalo de confiança. O ganho *direcional* já existe; a calibração pode
aumentá-lo ou reduzi-lo — o resultado é publicado de qualquer forma.

---

## 4. Avenida B — O lote como portfólio

### 4.1 Probabilidade de ≥1 prêmio (enumeração exata, R10)

| Lote | Mesma dupla | Independentes | Complementares | Observação |
|---|---|---|---|---|
| +Milionária, 2 jogos | 16,87% | 17,15% | **17,25%** | máximo exato; diferenças dentro do ruído — não declarar ganho |
| +Milionária, 3 jogos | 24,29% | 25,11% | **25,42%** | máximo; implementado |
| +Milionária, 4 jogos | 31,05% | 32,62% | **32,91%** | implementado |
| Mega-Sena, 3 jogos | — | 0,1305% | 0,1306% (disjunto) | diferença desprezível — não vender como ganho |

Nossa simulação independente (500 mil lotes, 3σ) reproduziu ~25,35% e
~32,99% para 3 e 4 jogos, consistentes com a enumeração exata (25,42% e
32,91%). Para 2 jogos, todas as estratégias ficam dentro do ruído.

### 4.2 O custo da disjunção absoluta (medição deste estudo)

A estratégia padrão força dezenas distintas entre os jogos do lote (decisão de
experiência, herdada da web, sem base matemática). Medição com 2.000 lotes de
4 jogos e 12 candidatos:

| Variante | Popularidade relativa média | Ganho condicional (N=20 M) |
|---|---|---|
| Padrão (dezenas disjuntas) | 0,6590 | ~6,7% |
| Relaxado (só sem repetir o jogo exato) | **0,6045** | **~7,8%** |

**Custo ≈ 8,3% em popularidade relativa** (o ganho condicional sobe ~17% em
termos relativos), sem contrapartida de chance na Mega (a perda de P(≥1) é
~0,005 pp em 4 jogos). Recomendação: oferecer dois modos explícitos — "máxima
diversificação" (disjunto, padrão atual) e "máximo valor condicional"
(relaxado) — e medir a preferência. Alternativa intermediária: limitar a
sobreposição máxima entre jogos (ex.: ≤2 dezenas).

### 4.3 Objetivo por faixa (correção de medida)

Hoje a penalidade de popularidade é única e o ganho exibido é genérico. Na
+Milionária, **99,0% da probabilidade de prêmio está nas faixas fixas 7–10**
(R$ 50/24/12/6), imunes ao rateio; apenas **1,0%** da probabilidade está nas
faixas de rateio 1–6, que concentram ~65% do valor esperado. Consequências:

- o número "X% a mais de prêmio se ganhar" é, na +Milionária, **ganho sobre as
  faixas de rateio**, não sobre o prêmio médio — hoje sem essa qualificação;
- o desempate deve maximizar `Σ_faixa P(faixa) · E[1/(1+K)] · bolo_faixa`,
  com peso zero nas faixas fixas (spec 003 FR-005);
- na Mega, todas as faixas são de rateio, então o número atual está correto.

### 4.4 Robustez à incerteza do modelo

Em vez de escolher sempre o "melhor" candidato (que concentraria usuários e
dependeria de um modelo não validado), usar escolha aleatória entre os melhores
— já é o comportamento com 12 candidatos. Ordem de grandeza do efeito manada:
30 mil jogos gerados pelo app contra 20 M apostas = 0,15% do mercado; o efeito
é desprezível hoje, mas a regra de escolha aleatória é o que mantém isso
verdadeiro se a base crescer.

---

## 5. Avenida C — Fechamentos: custo por garantia

A garantia já é exata: `ClosureDesigner` verifica **todos** os C(v,t)
subconjuntos. O que falta é custo. Seis dos 18 tamanhos são subótimos frente
aos melhores limites conhecidos (La Jolla Covering Repository / Gordon):

| Garantia | v | Jogos atuais | Melhor conhecido | Excesso |
|---|---|---|---|---|
| Quadra | 11 | 33 | 32 | +3% |
| Quadra | 12 | 50 | 41 | +22% |
| Quadra | 13 | 78 | 66 | +18% |
| Terno | 13 | 23 | 21 | +10% |
| Terno | 14 | 28 | 25 | +12% |
| Terno | 15 | 37 | 31 | +19% |

Importar as tabelas publicadas e **revalidar com `verify()` exaustivo** corta
custo mantendo a garantia — é o único ganho de fechamento autorizado. Além
disso:

- **garantia com trevos (+Milionária)**: repetir C(v,6,t) em 3 cores de duplas
  (R11) e verificar exaustivamente; hoje a modalidade recusa fechamento, o que
  é honesto mas deixa valor na mesa;
- **múltiplas garantias**: exibir o custo de "quadra **ou** quina" exige
  cobertura que satisfaça os dois t simultaneamente; o contrato deve declarar
  a faixa garantida exata;
- **contrato completo** (condição, faixa, prêmio mínimo, custo, chance da
  condição, aviso de retorno inalterado) — spec 002 FR-025.

---

## 6. Avenida D — Escolha do concurso: a maior alavanca de valor

Nenhuma escolha de dezenas muda o valor esperado incondicional; **escolher o
concurso muda**. Cálculo deste estudo (Mega, sem IR, desconsiderando os pools
reservados de 22% e 10%):

| Apostas no concurso (N) | E[1/(1+K)] | ΔEV por R$ 6 a cada R$ 100 M acumulados | Acumulado de equilíbrio (só sena) |
|---|---|---|---|
| 20 M | 0,824 | **+R$ 1,65** | R$ 364 M |
| 100 M | 0,433 | +R$ 0,86 | R$ 694 M |
| 200 M | 0,246 | +R$ 0,49 | **R$ 1,22 bi** |

Leitura: o acumulado pode mais que dobrar o valor esperado por real em
acumulados altos com poucas apostas — mas o **número de apostas responde ao
prêmio**, e com 200 M apostas só um acumulado acima de R$ 1,2 bi levaria o
retorno da sena a 100%. A resposta da demanda é o que impede que o acumulado,
sozinho, torne o retorno positivo. O painel deve:

1. estimar N_t (modelo de demanda, R8) — **nunca** usar o acumulado isolado;
2. mostrar retorno antes/depois de IR, perda esperada do lote e acumulado de
   equilíbrio;
3. aplicar regras especiais (finais 0/5, Virada 90/5/5, reserva da
   +Milionária);
4. declarar indisponível quando o dado faltar (FR-020);
5. jamais recomendar comprar todas as combinações (FR-017).

Esse é o eixo em que a "precisão" tem o maior impacto em reais — e o único
que o app ainda não explora (spec 002 US-003).

---

## 7. Avenida E — Viés forense: a única porta para mudar P

Piso de detecção (3,3σ ≈ Bonferroni, desvio relativo por elemento):

| Universo | Desvios no histórico | Piso de detecção |
|---|---|---|
| Mega-Sena, dezenas | ~4.400 concursos | **14,9%** |
| Mega-Sena, dezenas | ~2.800 com arrecadação | 18,7% |
| +Milionária, dezenas | ~600 concursos | **36,5%** |
| +Milionária, trevos | ~600 concursos | 19,1% |

Ou seja: uma dezena 10% mais provável **não é detectável** no histórico atual;
só defeitos grosseiros (bola pesada, globo viciado) apareceriam. O uso
correto é o da spec 002 US-006: testes motivados pela física (dois globos,
ordem de extração, locais/eras, periodicidade, ganhadores anômalos), cada um
pré-registrado, com controle negativo e positivo, poder e MDE declarados. Só
viés **replicado no regime atual** pode alterar a geração, limitado ao efeito
estimado. Note que a +Milionária, com 600 concursos, tem poder forense baixo:
declarar isso é mais importante que rodar um teste que não detecta nada.

---

## 8. Avenida F — Engenharia e dados

### 8.1 Ingestão necessária para a calibração

Hoje o app persiste apenas o sorteio (dezenas, trevos, data, concurso). A
calibração exige, por concurso: **arrecadação**, **ganhadores por faixa**,
**valor pago por faixa**, e para a auditoria: ordem de extração, local. Passos:

1. estender `CaixaDrawDto`/`DrawEntity` (ou tabela satélite) e o espelho web;
2. sincronizar concursos antigos uma vez (com preço por era — R5);
3. versionar o dataset de calibração (hash, período, fonte, data);
4. script de ajuste fora do app; o app consome o artefato (não roda MLE no
   celular).

### 8.2 Paridade e reprodutibilidade

- RNG: `SecureRandom` (Android) e `crypto.getRandomValues` com fallback
  `Math.random` (web; seed determinístico nos testes); amostragem uniforme sem
  viés de módulo — ok. Testes usam semente.
- A paridade entre plataformas não deve exigir a mesma sequência de sorteios
  (RNGs diferentes), e sim as mesmas **distribuições** e o mesmo contrato:
  recomendo um teste de paridade distribucional (média de popularidade e
  P(≥1) por plataforma, tolerância pré-registrada).
- O web ainda não corrigiu as 10 faixas da +Milionária (9 faixas, 1 em 1.099):
  corrigir antes de qualquer exibição de rateio da modalidade.

### 8.3 Monitoramento

- Telemetria agregada (sem dados pessoais) da popularidade média dos lotes
  gerados e da concentração (colisões de jogos) para detectar manada;
- alarme de deriva: se a distribuição de ganhadores observada divergir do
  modelo calibrado além do intervalo, recalibrar ou declarar vencido.

---

## 9. O que não fazer (e o número que prova)

| Prática | Por que não | Número |
|---|---|---|
| Ponderar dezenas por frequência histórica | efeito nulo; piso de detecção 15% | `E[acertos]` independe; refutado no laboratório |
| LSTM/XGBoost/ARIMA na geração | sobreajuste a ruído i.i.d. | nenhum efeito acima da chance; spec 002 US-005 |
| "Números quentes/frios" | mesma coisa, com outro nome | ver acima |
| Vender lote/arranjo como ganho de chance na Mega | ganho ~0,0001 pp | R10 (exato) |
| Escolher sempre o jogo "ótimo" | cria aglomeração — o app vira a fonte de popularidade | 12 candidatos + escolha aleatória |

---

## 10. Roadmap priorizado

| # | Iniciativa | Alavanca | Efeito esperado | Esforço | Risco | Critério de aceite |
|---|---|---|---|---|---|---|
| 1 | Corrigir as 10 faixas da +Milionária no web (spec 002 US-001) | correção | chance exibida 1 em 11,39; base para rateio | baixo | baixo | paridade web/Android nos cenários de referência |
| 2 | Ingestão de arrecadação e ganhadores por faixa | dados | habilita calibração e timing | médio | baixo | dataset versionado, cobertura ≥1.900 concursos Mega |
| 3 | Objetivo por faixa + qualificação do ganho na +Milionária | medida | número exibido deixa de superestimar | médio | baixo | ganho só nas faixas de rateio, com IC |
| 4 | Modo "máximo valor" (disjunção opcional) | otimização | +8,3% de popularidade relativa | baixo | baixo | P(≥1) exibida; escolha do usuário |
| 5 | Calibração brasileira (spec 003) | otimização | magnitude estimada com IC; aprovação ou reprovação publicada | alto | médio | validação R7 nas duas janelas |
| 6 | Painel de valor/timing do concurso (spec 002 US-003) | seleção | ΔEV de R$ 0,49–1,65 por R$ 6 em acumulados | alto | médio | recálculo manual em 5 cenários |
| 7 | Fechamentos: tabelas menores + trevos (R11) | custo | −3 a −18% de jogos em 6 tamanhos | médio | baixo | verificação exaustiva em todos os designs |
| 8 | Bateria forense (spec 002 US-006) | probabilidade (só viés replicado) | insurance; MDE declarado | alto | baixo | controles neg/pos ≥80% |
| 9 | Otimização de portfólio (P(≥1) / co-vencedores conjunta) | estrutura | pequeno na Mega; mantém o máximo na +Milionária | médio | baixo | enumeração exata para n≤4 |
| 10 | Monitoramento de manada e deriva | governança | mantém a validade da calibração | baixo | baixo | alarmes e recalibração |

**Dependências**: 5 depende de 2; 3 e 4 são independentes; 6 depende de 2;
7 depende de validação; 8 é independente.

---

## 11. Protocolo de validação (para qualquer item novo)

1. **Pré-registro** versionado antes de ver o dado real: hipótese, métrica,
   limiar, conjunto de confirmação, poder.
2. **Controles**: histórico honesto simulado (adoção ≤5%) e histórico com
   efeito plantado do tamanho da literatura (detecção ≥80%).
3. **Fora da amostra**: treino/confirmação/prospectivo.
4. **Publicação simétrica**: resultado negativo aparece com o mesmo destaque.
5. **Guardrails**: nenhuma mudança pode elevar a chance declarada; a
   distribuição gerada deve permanecer uniforme no limite sem informação.

**Reprodutibilidade**: as medições deste estudo (estrutura de lote, ganho
condicional vs N, piso de detecção, poder de calibração e timing) são
reproduzidas por `node scripts/precision-study.mjs [tentativas]` — Node puro,
semente fixa. As probabilidades de lote da Mega são exatas (enumeração); as da
+Milionária são simuladas e conferidas contra a enumeração exata do R10.

---

## 12. Referências

- Wang, Potter van Loon, van den Assem e van Dolder, *Number preferences in
  lotteries*, JDM 11(3), 2016.
- Roger e Roger, *On the preference for prime numbers*, 2024.
- Clotfelter e Cook, *The "Gambler's Fallacy" in Lottery Play*, Mgmt Sci 39(12),
  1993.
- Baker e McHale, *Investigating the behavioural characteristics of lottery
  players*, JRSS A 174(4), 2011 (e JRSS A 172(4), 2009).
- Farrell, Hartley, Lanot e Walker, *The demand for lotto: evidence of
  conscious selection*, JBES 18(2), 2000.
- Gordon e Stinson, *Coverings* (tabelas de covering designs).
- Spec 002 (cinco famílias): `specs/002-generation-five-families/`.
- Spec 003 (calibração): `specs/003-popularity-calibration/`.
- Código: `shared/.../generator/`, `web/src/engine/`, `docs/refinamento-estatistico.md`.
