# Research: Método de geração à luz das cinco famílias de métodos

Fase 0 do plano. Cada item segue o formato **Decisão / Racional /
Alternativas**. Fontes primárias primeiro; fontes secundárias estão marcadas
como tal e, quando sustentam uma decisão, viram tarefa de confirmação.
Números marcados com † foram calculados durante o planejamento por enumeração
exata ou aritmética das regras (scripts descritos em R17), não estimados.

## R1. Regras oficiais vigentes e divergências encontradas

**Decisão**: as regras de prêmio passam a ser **dados** num arquivo único
(`web/src/data/rules/official-rules.json`, contrato em
`contracts/official-rules.md`), com fonte e data de conferência em cada valor,
lido pelo motor web e conferido pelos testes do Kotlin. Os valores abaixo
entram na primeira versão.

| Regra | Valor oficial (fonte) | Web hoje | Android hoje |
|---|---|---|---|
| Fração da arrecadação para prêmio bruto | **43,79%** nas duas modalidades ([Caixa, Mega-Sena](https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx); [Caixa, +Milionária](https://loterias.caixa.gov.br/Paginas/Mais-Milionaria.aspx); [Lei 13.756/2018, art. 16, II](https://www.legjur.com/legislacao/art/lei_00137562018-16)) | não modela | **43,35%** (`PrizeTable.kt`, conferido em 2026-09-03 contra matéria do g1) |
| Mega-Sena, divisão | 40% sena, 13% quina, 15% quadra, 22% acumulam para concursos de final 0 ou 5, 10% para a Mega da Virada (Caixa; [Portaria SPA/MF nº 1.656/2025](https://okai.com.br/documento/2025-07-31/portaria-spa-mf-nº-1-656-de-29-de-julho-de-2025)) | não modela | correto |
| Mega-Sena, faixa sem ganhador | "o valor acumula para o concurso seguinte, na respectiva faixa" (Caixa) | não modela | só faixa 1 |
| Mega da Virada | 90% sena, 5% quina, 5% quadra (Caixa); não acumula: sem ganhador da sena, o prêmio vai para a quina e, sem quina, para a quadra ([Olhar Digital](https://olhardigital.com.br/2024/12/29/internet-e-redes-sociais/mega-da-virada-o-que-acontece-se-ninguem-acertar/), secundária) | não modela | não modela |
| +Milionária, ordem de dedução | "Dessa porcentagem é deduzido 5% para composição da reserva garantidora de prêmios. **Do restante**, será deduzido o montante destinado ao pagamento dos prêmios com valores fixos" (Caixa) | não modela | **ordem invertida**: prêmios fixos primeiro, reserva depois |
| +Milionária, divisão | 62/10/8/8/6/6 (faixas 1–6) sobre o que sobra; faixas 7–10 fixas: R$ 50, R$ 24, R$ 12, R$ 6 (Caixa) | não modela | correto |
| +Milionária, faixa sem ganhador | faixas 2–6: o valor desce para a faixa seguinte; sem ganhador na 6, vai para a faixa 1 do concurso seguinte; faixa 1 acumula (Caixa) | não modela | não modela |
| +Milionária, reserva garantidora | prêmio mínimo de R$ 10 milhões líquidos na faixa 1; acima de R$ 100 milhões líquidos, o excedente vai para o prêmio principal seguinte; sem uso por 12 meses, o saldo é incorporado ao prêmio principal (Caixa) | não modela | não modela |
| Preço da aposta simples | R$ 6,00 nas duas; aposta múltipla da Mega custa C(k,6) × R$ 6 (7 números = R$ 42; 8 = R$ 168) (Caixa) | R$ 6 (`closureDesigner.ts`) | R$ 6 |

**Racional**: as duas divergências numéricas não são cosméticas. Com 43,35%
o retorno esperado sai cerca de 1% menor do que o real; e, mesmo com a fração
corrigida, a reserva na ordem errada deixa o bolo de rateio da +Milionária em
R$ 1,7536 por aposta em vez de R$ 1,7145 † (+2,3%). Pior: hoje cada plataforma tem a sua cópia dos percentuais, e
foi assim que elas divergiram (Princípio V).

**Alternativas**: (a) só corrigir as constantes nos dois códigos — rejeitada,
repete o mecanismo que causou a divergência; (b) buscar a regra em tempo de
execução — rejeitada, não há fonte estruturada oficial e o app precisa
funcionar offline; (c) gerar código Kotlin a partir do JSON — adiada, um teste
de equivalência que lê o mesmo arquivo dá a mesma garantia com menos
maquinário.

**A confirmar na fase 1**: a regra de repasse da Virada na fonte primária (a
página da Caixa não traz o texto; o dado vem de imprensa); se há regra própria
para concursos comemorativos (ex.: "Mega 30 anos", 2026). Sem regra
confirmada, o valor do concurso é declarado indisponível (FR-020).

## R2. As faixas da +Milionária na web estão erradas

**Decisão**: corrigir `web/src/engine/prizeRules.ts` para as 10 faixas
oficiais, com trevos como conjunto ("1 ou nenhum"), e corrigir todos os
consumidores que avaliam a +Milionária sem trevos.

**Racional**: a web lista 9 faixas (6, 5 e 4 dezenas cruzadas com 2, 1 e 0
trevos). Faltam 3+2, 3+1, 2+2 e 2+1, e "1 ou nenhum trevo" aparece dividida em
duas faixas. Resultado †: chance de prêmio de 0,0009097 (1 em 1.099) contra
0,0877961 (**1 em 11,39**) pelas regras oficiais. O Android já foi corrigido
(`PrizeRules.kt`, documentado em `docs/refinamento-estatistico.md` §2.0); a
web não acompanhou. Consumidores afetados, conferidos no código:

- `powerAnalysis.anyPrizeProbability`: soma só 4+ dezenas; é a linha de base
  do Módulo B e do benchmark.
- `closureDesigner.offeredGuarantees`: não oferece a garantia de 3 dezenas na
  +Milionária, que paga R$ 24 (3+1) ou R$ 50 (3+2).
- `audit/moduleB.ts`, `strategyBenchmark.ts`, `bankrollSimulation.ts`: chamam
  `classifyHits(lottery, hits)` sem trevos, o que na +Milionária só reconhece
  faixas "+0 trevo".

**Alternativas**: nenhuma razoável; é correção de bug, com teste de regressão
que percorre todas as combinações (dezenas 0–6 × trevos 0–2).

## R3. Dados disponíveis por concurso

**Decisão**: um script novo, `web/scripts/update-rateio-seed.mjs`, baixa da
API já usada pelo app o histórico completo **com rateio** e grava
`web/src/data/rateio/` (contrato em `contracts/rateio-history.md`), validando
contra a API oficial da Caixa por amostragem. Em runtime, `fetchContestOutlook`
lê os campos de panorama do último concurso.

**Racional**: a estrutura das duas APIs foi conferida em 2026-10-06 (só
estrutura; ver R17). Ambas expõem, por concurso: arrecadação, ganhadores e
valor por faixa (3 na Mega, 10 na +Milionária), dezenas na ordem de extração,
local do sorteio, acumulado para o próximo, acumulado para finais 0 ou 5,
acumulado especial (Virada) e prêmio estimado. A oficial expõe ainda o saldo da
reserva garantidora da +Milionária e o próximo concurso de final 0 ou 5
(`contracts/caixa-api-fields.md`). Cobertura observada na amostra: ganhadores
por faixa e ordem de extração existem desde os primeiros concursos; a
arrecadação da Mega-Sena aparece zerada nos concursos 500 e 1.000 e preenchida
a partir de algum ponto entre 1.000 e 1.200 (o script fixa o ponto exato); na
+Milionária, existe desde o concurso 1.

O comentário de `web/src/app/page.tsx` que justifica o campo manual de apostas
("a API pública não expõe a arrecadação do concurso") está desatualizado: o
campo existe nas duas APIs.

**Alternativas**: (a) buscar só em runtime — rejeitada (auditoria e calibração
precisam ser reprodutíveis e offline); (b) usar só a API oficial — rejeitada
como fonte principal porque o app inteiro já usa a de terceiros e a oficial
muda de formato sem aviso; fica como conferência.

## R4. Imposto de renda sobre prêmios

**Decisão**: o modelo de prêmio aplica 30% de IR na fonte sobre prêmios acima
do limite de isenção, faixa a faixa, com o limite como parâmetro datado no
arquivo de regras. O painel mostra o retorno antes e depois do IR.

**Racional**: a alíquota de 30% retida na fonte é consenso
([Money Times](https://www.moneytimes.com.br/imposto-de-renda-na-loteria-leva-30-do-premio-veja-quanto-sobra-dos-r-160-milhoes-da-mega-sena-apos-a-mordida-do-irpf/),
secundária). O limite de isenção aparece com valores diferentes conforme a
fonte (R$ 2.112,00 e R$ 2.259,20 na mesma matéria da
[Tribuna de Minas](https://tribunademinas.com.br/maistendencias/saiba-quanto-o-vencedor-da-mega-sena-de-quase-r-40-milhoes-paga-de-imposto-de-renda)),
o que é sinal de valor que mudou no tempo. Ele importa: a quadra da Mega
(prêmio médio de R$ 919 no instantâneo de R9 †) e as faixas 5–10 da
+Milionária ficam abaixo dele e não pagam IR; sena e quina pagam. A imprensa
afirma que o prêmio **estimado** anunciado pela Caixa já é líquido de IR; isso
decide se o acumulado informado entra bruto ou líquido no cálculo.

**A confirmar na fase 1**: o limite vigente na Receita Federal; se
`valorEstimadoProximoConcurso` e `valorAcumuladoProximoConcurso` são líquidos
ou brutos (teste: reconstruir um concurso pago a partir do rateio publicado).

## R5. Número de apostas por concurso e preço por era

**Decisão**: apostas simples equivalentes = arrecadação ÷ preço vigente na
data do concurso. A calibração usa um efeito fixo por era de preço, para que
um erro na data exata de um reajuste não distorça os parâmetros de
popularidade.

**Racional**: o preço de uma aposta múltipla é C(k,6) × preço da simples
(tabela da Caixa), então arrecadação ÷ preço conta exatamente as combinações
de 6 compradas, inclusive em bolões e apostas múltiplas. Os reajustes da
Mega-Sena encontrados em fontes secundárias: R$ 2,50 → R$ 3,50 em maio de 2015
([Acessa](https://www.acessa.com/pelobrasil/arquivo/noticias/2015/04/29-apostar-na-mega-sena-ficara-mais-caro-a-partir-de-maio/amp/index.html)),
→ R$ 4,50 ([Bahia Notícias](https://www.bahianoticias.com.br/noticia/240960-valor-de-aposta-da-mega-sena-aumenta-para-r-450-governo-validou-aumento-das-loterias)),
→ R$ 5,00 (2023), → R$ 6,00 (julho de 2025). A tabela completa, com datas
exatas, é tarefa da fase 2; uma checagem automática compara arrecadação ÷
preço com o número de ganhadores de quadra e acusa mudança de escala onde a
tabela estiver errada.

**Alternativas**: estimar o número de apostas pelo próprio número de
ganhadores — rejeitada, seria circular para a calibração de popularidade.

## R6. Modelo de popularidade (Família A, ao contrário)

**Decisão**: modelo log-linear fatorado com mistura de Surpresinha, ajustado
por máxima verossimilhança binomial negativa sobre os ganhadores por faixa:

- Escolha de dezenas: π(c) = s · 1/C(N,6) + (1 − s) · ∏ᵢ∈c wᵢ / e₆(w), com
  log wᵢ = β·xᵢ + bᵢ. `xᵢ` são atributos da dezena pré-registrados (≤ 31,
  ≤ 12, primo, 7, múltiplo de 5 e de 10, linha e coluna no volante, distância
  ao centro); `bᵢ` é um efeito próprio da dezena, com penalidade ridge e soma
  zero; `s` é a fração de apostas aleatórias.
- Trevos (+Milionária): τ({a,b}) = sₜ · 1/15 + (1 − sₜ) · vₐ·v_b / e₂(v).
- Ganhadores esperados da faixa k no concurso t (Mega):
  Λₜₖ = Nₜ · ρ_era · [s · Pₖ + (1 − s) · eₖ(w_D) · e₆₋ₖ(w_{D̄}) / e₆(w)],
  onde D é o sorteio, D̄ o complemento e eⱼ o polinômio simétrico elementar de
  grau j. Na +Milionária, multiplica-se pelo termo análogo dos trevos.
- Verossimilhança: Wₜₖ ~ BinomialNegativa(Λₜₖ, φₖ) — a sobredispersão vem de
  apostas múltiplas e bolões, que fazem combinações vizinhas andarem juntas.

**Racional**:

1. **Exato e barato**. A soma sobre as 21.465 combinações de quadra de um
   sorteio sai do produto de dois polinômios simétricos, O(60 × 6) por
   concurso; o escore de um candidato no gerador é O(6). A identidade é
   conferida contra força bruta em universos pequenos (Princípio III).
2. **Identificável**. A média sobre todos os sorteios possíveis de
   Σ_{|c∩D|=k} π(c) é exatamente Pₖ, qualquer que seja π; logo ρ_era absorve
   só erro de preço/apostas, e a variação **entre** concursos identifica w.
   Os trevos são identificáveis pelas razões entre faixas que só diferem nos
   trevos (5 × 6, 7 × 8, 9 × 10 da +Milionária).
3. **Precedente direto**. Baker e McHale ajustaram um modelo de preferência
   por combinações aos números de ganhadores por faixa da loteria britânica e
   do El Gordo espanhol, reproduzindo inclusive as correlações entre faixas
   ([JRSS A 174(4), 2011](https://ideas.repec.org/a/bla/jorssa/v174y2011i4p1071-1086.html);
   ver também [JRSS A 172(4), 2009](https://ideas.repec.org/a/bla/jorssa/v172y2009i4p813-834.html)).
   Farrell, Hartley, Lanot e Walker acharam "forte evidência" de escolha
   consciente com dados de rateio
   ([JBES 18(2), 2000](https://ideas.repec.org/a/bes/jnlbes/v18y2000i2p228-41.html)).
4. **A Surpresinha não é publicada** (a Caixa disse não ter o dado nesse nível,
   [Exame](https://exame.com/invest/minhas-financas/caixa-nao-sabe-quantas-surpresinhas-ja-venceram-a-mega-sena/)),
   então `s` é estimado, não suposto.

O segundo estágio (sequências, alinhamento no volante, progressões), que
quebra a fatoração, só é tentado se o primeiro for adotado, com correção por
amostragem por importância.

**Alternativas**: (a) manter a heurística — vira a linha de base da validação
(R7), não é descartada; (b) modelo de aglomerados de Baker e McHale — mais
fiel, mas não fatora e custaria simulação para cada candidato no celular;
(c) aprendizado de máquina sobre combinações — sem necessidade, sem
interpretação e com risco de sobreajuste; (d) preferências por par de dezenas —
centenas de parâmetros para ~1.900 concursos úteis.

## R7. Validação da popularidade, em três vias

**Decisão**: três modelos competem fora da amostra — escolha uniforme (s = 1),
heurística atual (`unpopularity.ts`, só com `s` e ρ ajustados) e calibrada (R6):

- **Treino**: concursos com arrecadação até o quantil de 80% da ordem
  cronológica. **Confirmação**: os 20% finais. **Prospectivo**: concursos
  sorteados depois do commit do pré-registro (mínimo pré-registrado: 30 da
  Mega e 15 da +Milionária).
- **Métrica**: desvio (deviance) binomial negativo médio por concurso nas
  faixas com ganhadores frequentes (quadra e quina na Mega; faixas 4 a 10 na
  +Milionária), pareado por concurso entre modelos.
- **Decisão**:
  - calibrada supera heurística e uniforme, nas duas partes → **calibrada
    adotada**;
  - heurística supera uniforme e a calibrada não a supera → **heurística
    mantida, agora validada**;
  - nenhuma supera uniforme → o app **deixa de exibir ganho de rateio** e
    explica que, no Brasil, a medida não se sustentou.
- **Limiar de "supera"**: redução relativa mínima do desvio e teste unilateral
  pareado (bootstrap em blocos, α = 0,05), com o limiar fixado no
  pré-registro a partir de simulação: o menor efeito que muda a escolha do
  gerador (ganho condicional ≥ 2% na seleção de 64 candidatos).

**Controles (Princípio III)**: ganhadores simulados sob escolha uniforme
(adoção ≤ 5%) e sob efeitos do tamanho da literatura — dia do nascimento
escolhido em 21,0% contra 13,3% esperados, Wang et al. 2016, já citado em
`unpopularity.ts` (adoção ≥ 80%).

**Racional**: a validação em três vias também testa a funcionalidade que já
está no ar. Se a heurística não prever ganhadores melhor que o acaso, o ganho
de rateio que o app exibe hoje não tem sustentação no Brasil, e isso precisa
ser dito.

## R8. Modelo de demanda (quantas apostas o próximo concurso terá)

**Decisão**: log Nₜ = α_era + β · log Jₜ + γ · [final 0 ou 5] + δ · [dia da
semana] + ε, onde Jₜ é o prêmio estimado anunciado antes do concurso. A Virada
fica fora (série própria, com poucos pontos). Adotado só se prever Nₜ melhor
que a regra atual do Android ("arrecadação do concurso anterior") fora da
amostra (erro percentual absoluto médio, teste pareado).

**Racional**: acumulado alto atrai apostas, e mais apostas significam mais
divisão do prêmio. Usar a arrecadação anterior superestima o retorno
justamente nos concursos que mais importam — o próprio `AccumulatedReturn.kt`
declara isso como limitação. A elasticidade da demanda em relação ao valor
esperado é medida na literatura com a variação induzida por acumulados
(Farrell et al., 2000, achando elasticidade próxima de 1).

**Alternativas**: usar a arrecadação anterior (vira linha de base); série
temporal completa (ARIMA) — mais parâmetros para pouca vantagem num problema
dominado pelo prêmio anunciado.

## R9. Família D no Brasil: o que Mandel e o Cash WinFall ensinam aqui

**Decisão**: implementar o retorno por concurso, o teste de Mandel e a chance
de repasse da Virada como **medidas**, exibidas sempre, com o resultado que
derem. Nenhuma recomendação de compra.

**Racional**. Os dois casos lucraram por defeito de regra, não por previsão:
Mandel cobria todas as combinações quando o acumulado superava o custo de
fazê-lo (Virgínia, 1992: 7.059.052 combinações, acumulado acima de US$ 27
milhões; [The Hustle](https://thehustle.co/the-man-who-won-the-lottery-14-times),
secundária); antes disso, usava coberturas para garantir prêmios menores —
segundo Stömmer, provavelmente um covering design (15, 6, 5) construído antes
de a teoria o publicar ([arXiv 2408.06857](https://arxiv.org/abs/2408.06857)).
No Cash WinFall, o roll-down era **anunciado antes** do sorteio (o acumulado
batia o teto) e tornava o bilhete mais valioso que o preço; grupos que
compravam mais de US$ 600 mil em bilhetes nesses concursos recuperavam de 15%
a 20% a mais do que gastavam, e o inspetor-geral de Massachusetts concluiu que
era legal e não afetava a chance de ninguém
([relatório, 2012](https://archives.lib.state.ma.us/server/api/core/bitstreams/ea1512d5-cb14-4881-a5c1-67fc2cfabcb5/content);
[The Tech](https://thetech.com/2012/08/01/cashwinfall-v132-n30)).

Aplicando as regras de R1 aos valores publicados com o concurso 3.066 da Mega e
395 da +Milionária (instantâneo de 2026-10-06, uniforme, N = arrecadação
anterior ÷ preço) †:

| | Mega-Sena 3.067 | +Milionária 396 |
|---|---|---|
| Apostas estimadas | 12,45 milhões | 1,92 milhão |
| Acumulado | R$ 81,4 milhões | R$ 100,3 milhões |
| Retorno por real, antes do IR | 40,1% | 31,0% |
| Retorno por real, depois do IR | 30,1% | ~26,6% |
| Acumulado de equilíbrio (antes do IR, N fixo) | R$ 285 milhões | R$ 1,09 bilhão |
| Custo de cobrir todas as combinações | R$ 300,4 milhões | R$ 1,43 bilhão |
| Teste de Mandel (retorno ÷ custo), antes / depois do IR | 0,56 / 0,41 | 0,49 / ~0,38 |

E o que mais importa para quem joga †: **o concurso escolhido move a perda por
real muito mais que qualquer escolha de dezenas**.

| Concurso | Retorno por real, antes do IR |
|---|---|
| Mega regular sem acumulado (8 a 20 milhões de apostas) | 14,8% a 18,0% |
| Mega regular com R$ 81 milhões acumulados (instantâneo) | 40,1% |
| Mega da Virada | 43,79% + (reservas e acumulados destinados a ela ÷ arrecadação dela): nada acumula, todo o bolo é pago no próprio concurso |
| +Milionária sem acumulado (com o mínimo de R$ 10 milhões líquidos) | 24,9% |

Num concurso regular da Mega, 32% do bolo (22% dos finais 0 ou 5 + 10% da
Virada) vai para concursos futuros, e os 40% da sena só são pagos se alguém
acertar; por isso o retorno depende tanto do acumulado. Na Virada, a chance de
ninguém acertar a sena, sob escolha uniforme, é 0,25% com 300 milhões de
apostas e 0,005% com 500 milhões †; a escolha consciente concentra apostas e
**aumenta** essa chance, mas não a ponto de criar um roll-down previsível. Ao
contrário do Cash WinFall, o repasse brasileiro não é anunciado: só acontece
se ninguém ganhar.

**Conclusão para o produto**: no instantâneo, nenhuma das duas modalidades
chega perto do critério de Mandel depois do IR, e não existe roll-down
anunciado. A Família D vira informação de **quando** jogar (onde a perda por
real é menor), calculada a cada concurso, e não uma estratégia de lucro. Se o
histórico (fase 3) mostrar concursos que chegaram perto, a metodologia diz
quais e por quê (FR-021).

**Alternativas**: omitir a Família D por "não dar lucro" — rejeitada; o
cálculo honesto é exatamente o que o usuário não acha em outro lugar.

## R10. Estrutura do lote (Família B, lote comum)

**Decisão**: na +Milionária, duplas de trevos complementares no lote; na
Mega-Sena, manter as dezenas disjuntas (já é o comportamento atual) só como
preferência de experiência, sem alegação de ganho; nas duas, exibir a chance
exata de ≥1 prêmio, calculada por enumeração.

**Racional** (enumeração exata †, dezenas disjuntas entre jogos):

| Lote | Mesma dupla em todos | Duplas independentes (hoje) | Duplas complementares |
|---|---|---|---|
| +Milionária, 2 jogos | 16,87% | 17,15% | **17,25%** (máximo) |
| +Milionária, 3 jogos | 24,29% | 25,11% | **25,42%** (máximo) |
| +Milionária, 4 jogos | 31,05% | — | **32,91%** |

O máximo foi conferido testando todas as 15ⁿ atribuições de duplas para n = 2
e n = 3. Na Mega-Sena o arranjo quase não importa: 3 jogos disjuntos dão
0,1306% de chance de ≥1 prêmio contra 0,1305% de 3 jogos independentes †,
porque o evento é raro demais para os jogos se sobreporem. O app não pode
vender esse arranjo como ganho de chance (FR-024).

A disjunção das dezenas tem um custo pequeno: restringe a escolha de jogos
pouco disputados nos jogos seguintes do lote. A fase 5 mede esse custo; se ele
for relevante, a disjunção vira opção.

**Alternativas**: maximizar a quantidade esperada de prêmios — rejeitada, é
igual para qualquer arranjo (linearidade da esperança).

## R11. Fechamentos com trevos (Família B, garantia)

**Decisão**: na +Milionária, garantias de 2, 3 e 4 dezenas **com pelo menos 1
trevo**, construídas repetindo uma cobertura C(v, 6, t) em 3 "cores" (duplas
disjuntas que cobrem os 6 trevos, escolhidas entre as menos populares). Toda
garantia é verificada exaustivamente antes de ser entregue; coberturas
coloridas menores achadas por busca (extensão de
`web/scripts/covering-search.mjs`) só entram depois da mesma verificação.

**Racional**:

- O que cada garantia paga: 2 dezenas + 1 trevo = faixa 10 (R$ 6); 3 + 1 =
  faixa 8 (R$ 24); 4 + 1 ou nenhum = faixa 6 (rateio). Com 2 trevos: R$ 12,
  R$ 50 e faixa 5 (rateio).
- Por que 3 cores: para todo subconjunto S de t dezenas, os jogos que contêm S
  precisam carregar, juntos, pelo menos 5 dos 6 trevos (senão o par de trevos
  ausentes, se sorteado, deixa S sem trevo). Com duplas, isso exige pelo menos
  3 jogos por S. Repetir a cobertura em 3 cores atinge exatamente essa
  condição; é o ponto de partida verificável. Coberturas com λ = 3 podem custar
  menos que 3 vezes a cobertura simples, daí a busca.
- O contrato (FR-025) mostra o custo ao lado do prêmio mínimo: uma garantia de
  R$ 6 que custa dezenas de reais é exibida como tal.
- Um fechamento não muda o retorno esperado por real: é a soma dos retornos
  dos jogos que o compõem. Ele troca a forma da distribuição (garantia
  condicional), não a média.

**Fora do escopo**: garantia de 5 dezenas (quina) na Mega-Sena. O usuário cita
"(15,6,5), 5.005 → 569 bilhetes" para Mandel; o melhor valor conhecido de
C(15, 6, 5) no La Jolla Covering Repository, segundo a busca feita, é 578
blocos (o repositório estava inacessível deste ambiente, com HTTP 502, e o
número precisa ser conferido nele antes de qualquer uso).

## R12. Família C (machine learning) no laboratório

**Decisão**: dois representantes leves, implementados no motor e treinados só
na parte de seleção, entram no Módulo B v2:

- `logistic-features`: regressão logística por dezena (e por trevo) sobre
  atributos defasados (frequência em janelas de 10, 25 e 100 concursos, atraso
  atual, paridade, década), escolhendo as 6 dezenas de maior probabilidade
  prevista;
- `markov-transition`: probabilidade de cada dezena dado o concurso anterior
  (matriz de coocorrência com suavização de Laplace) — a hipótese de "memória"
  do globo.

Para cada um, o relatório mostra o desempenho dentro da amostra (o modelo
avaliado nos concursos em que foi treinado) ao lado do desempenho fora dela: a
diferença é o sobreajuste, com intervalo de confiança.

**Racional**: em sorteio i.i.d., todo preditor tem, fora da amostra,
exatamente a média de acertos do acaso (teorema da invariância); o que um
modelo mais flexível acrescenta é só mais sobreajuste. Dois representantes —
um de atributos e um de dependência temporal — cobrem as duas hipóteses que a
Família C vende. LSTM, XGBoost e similares ficam fora: custo de implementação e
execução alto, e a mesma previsão nula.

**Alternativas**: Random Forest em TypeScript — rejeitada pelo custo; rodar
modelos em Python fora do app — rejeitada, o resultado não seria reprodutível
pelo próprio app nem pelos testes.

## R13. Família A no laboratório

**Decisão**: o Módulo B v2 passa de 5 para 12 estratégias, todas definidas para
dezenas **e** trevos: as atuais (`tier-weighted`, `frequency-pure`,
`cold-numbers`, `gap-maximizer`, `random-uniform`), as novas da Família A
(`overdue` — maior atraso atual; `hot-window-25`; `sum-band` — soma no
intervalo interquartil esperado; `parity-balanced` — 3 pares e 3 ímpares;
`volante-spread` — no máximo uma dezena por linha e por coluna do volante) e
as duas da Família C (R12).

**Racional**: o desenho do Módulo B já evita a diluição do poder por
múltiplas comparações: corrige na seleção e testa **uma** estratégia na
confirmação. Numerologia fica fora como preditor (depende de dado pessoal e é
nula pelo teorema); como comportamento dos apostadores, ela já aparece na
popularidade (preferência por datas). Os atributos que os métodos populares
usam (datas, padrões do volante, "números da sorte") são os mesmos que o
modelo de R6 mede — a Família A entra duas vezes, uma como hipótese a refutar
e outra como retrato do apostador.

## R14. Família E: testes forenses com motivação física

**Decisão**: cinco testes novos no Módulo A, pré-registrados, cada um com o
defeito físico que ele procuraria e o controle positivo correspondente:

| Teste | Hipótese física | Dado | Controle positivo |
|---|---|---|---|
| A6 dígitos dos globos | Na era de dois globos (dezena 0–5 e unidade 0–9; "00" = 60), uma bola defeituosa afeta **todas** as dezenas que compartilham o dígito — 6 ou 10 dezenas juntas, sinal que o teste por dezena dilui | Mega-Sena até o concurso 1.139 (era de dois globos até 31/12/2009, segundo [Olhar Digital](https://olhardigital.com.br/curiosidades/?p=1056), secundária); era de globo único como contraste | bola "7" do globo de unidades mais leve |
| A7 ordem de extração | Mistura insuficiente: se as bolas entram no globo em ordem, as primeiras extraídas carregam essa ordem | `dezenasOrdemSorteio`, posição × posto da bola no conjunto (6 × 6) | propensão de extração decrescente com a ordem de carga |
| A8 locais e eras | Mudança de equipamento ou de local altera o processo | `localSorteio` (na amostra: Caminhão da Sorte, Espaço Caixa Loterias, Estúdio de TV, Espaço Loterias Caixa, Espaço da Sorte) e era de globos | um estrato com viés |
| A9 periodicidade | Rodízio de jogos de bolas: um jogo viciado usado a cada k concursos produz viés periódico | série de presença de cada dezena; periodograma (teste g de Fisher) e autocorrelação nas defasagens 2 a 12 | jogo viciado a cada k concursos |
| A10 ganhadores atípicos | Número de ganhadores muito acima do previsto: erro de dado, padrão atípico de apostas ou falha do modelo — foi o padrão de apostas que denunciou a fraude da loteria da Pensilvânia em 1980 ([Wikipedia](https://en.wikipedia.org/wiki/1980_Pennsylvania_Lottery_scandal)) | ganhadores por faixa contra o intervalo preditivo da popularidade (R6), controle de FDR entre concursos | ganhadores extras injetados |

O **portão forense** (`audit/gate.ts`) tem quatro estados: sem viés (padrão);
viés só em era encerrada (nunca muda a geração); viés no regime atual não
replicado (nada muda); viés no regime atual replicado em concursos
posteriores ao pré-registro (o gerador inclina o sorteio pelo efeito
estimado com encolhimento — o mesmo de `bayesEvidence.ts` —, limitado, e
mostra a evidência).

**Racional**: a bateria atual (A1–A5, Bayes, colisão, sobreposição) testa
uniformidade de forma genérica. Testes desenhados a partir de **como** o
sorteio é feito têm muito mais poder contra os defeitos que de fato poderiam
existir. O caso do Hot Lotto (gerador de números adulterado por um diretor de
segurança, [Wikipedia](https://en.wikipedia.org/wiki/Hot_Lotto_fraud_scandal))
mostra por que auditar vale, mas trata de sorteio por software; os sorteios da
Caixa são mecânicos, e por isso os testes aqui são mecânicos.

**A confirmar na fase 7**: a data e o concurso exatos da troca para globo
único (fonte primária); se a Caixa usa rodízio de jogos de bolas e com que
período (define as defasagens de A9 antes do dado, não depois); a grafia
canônica dos locais (normalização pré-registrada).

**Considerados e não adicionados**: bateria NIST SP 800-22 e Diehard (feitas
para bits de geradores digitais; mesma conclusão de
`docs/metodos-estatisticos-adicionais.md`).

## R15. Múltiplas comparações e pré-registros

**Decisão**:

- Módulo A: A6–A10 entram na mesma família de Bonferroni de A1–A5 (o alfa
  corrigido cai; o relatório já informa o menor efeito detectável, que mostra
  o custo disso). A10 é triagem: Benjamini-Hochberg entre concursos, fora da
  família de Bonferroni, apresentado como "concursos para conferir".
- Módulo B v2: seleção com correção entre 12 estratégias; confirmação de uma só
  estratégia (α = 0,05) na parte reservada e no prospectivo.
- Popularidade e demanda: critérios próprios (R7, R8).
- Versões: `PREREGISTRATION_VERSION` 1.0.0 → 2.0.0; `MODULE_B_VERSION` 1.0.0 →
  2.0.0; `popularity/preregistration.ts` e `demandModel` 1.0.0. Todo artefato
  de modelo grava o commit do pré-registro que o originou
  (`contracts/model-artifacts.md`).

**Racional**: o Princípio II exige data anterior ao dado; o histórico de
rateio só é baixado depois do commit (guarda nos scripts).

## R16. Paridade web/Android

**Decisão**: regras e modelos como dados compartilhados; testes de paridade no
Kotlin lendo os mesmos arquivos (`PrizeTableParityTest`,
`PopularityParityTest`); `scripts/sync-shared-models.mjs` copia os arquivos
para os assets do Android. Divergências existentes, a resolver na fase 1 (regras)
ou 8 (geração):

| Item | Web | Android |
|---|---|---|
| Fração do prêmio bruto | não modela | 43,35% (oficial: 43,79%) |
| Ordem da reserva da +Milionária | não modela | fixos antes da reserva (oficial: reserva antes) |
| Faixas da +Milionária | 9, erradas | 10, corretas |
| Estratégia padrão do gerador | uniforme, melhor de 64 por popularidade | tiers de frequência, melhor de 12 por popularidade |

**Racional**: a estratégia padrão diferente faz as duas plataformas entregarem
jogos de natureza diferente para o mesmo usuário. A da web é a coerente com o
Princípio I (os tiers de frequência não têm efeito sobre a chance e só
atrapalham a escolha por popularidade); a fase 8 alinha o Android a ela.

## R17. Transparência: o que foi visto do dado durante este planejamento

O Princípio II exige que critérios sejam fixados antes de olhar o dado. Durante
o planejamento:

- A **estrutura** das respostas das duas APIs foi conferida (nomes de campos,
  presença de arrecadação e ganhadores em concursos de amostra: Mega 100, 500,
  1.000, 1.200, 1.500, 1.800, 2.000, 2.300, 2.600, 2.900 e 3.066; +Milionária
  1 e 395).
- Ao imprimir a estrutura, apareceram os números de ganhadores e prêmios de
  **dois** concursos (Mega 3.066 e +Milionária 395). Nenhuma estatística de
  popularidade, demanda ou forense foi calculada sobre eles. Os dois caem na
  parte de confirmação da validação; o efeito de tê-los visto é nulo na
  prática, mas fica registrado.
- Os números marcados com † vêm de enumeração exata ou de aritmética das
  regras oficiais sobre os valores publicados com o concurso mais recente
  (retorno por concurso, teste de Mandel). São medidas, não testes de
  hipótese; não usam o histórico que as validações pré-registradas vão
  avaliar.
- Scripts dessas contas: enumeração hipergeométrica multivariada com os 15
  pares de trevos para R10; aritmética das regras de R1 para R9. Eles serão
  reescritos como testes do motor na implementação (os valores esperados
  acima viram asserções).
