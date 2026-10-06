# Feature Specification: Método de geração à luz das cinco famílias de métodos (Mega-Sena e +Milionária)

**Feature Branch**: `002-generation-five-families`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Planeje melhoria no método de geração tanto da Mega-Sena como da +Milionária, com base no texto a seguir: Taxonomia completa dos métodos existentes — Família A (estatística popular: quentes/frias, atrasadas, somas, paridade, padrões do volante, numerologia); Família B (combinatória de cobertura: desdobramentos e fechamentos/covering designs); Família C (machine learning e séries temporais: LSTM, Random Forest, XGBoost, ARIMA, Monte Carlo — consenso de que em sorteios i.i.d. não há sinal); Família D (arbitragem estrutural: Stefan Mandel — condensação combinatória e 'buy the pot' quando o acumulado supera o custo de cobrir tudo; Cash WinFall — roll-down que tornava o valor esperado positivo); Família E (estatística forense: uniformidade, rachas, espectrais, para detectar viés ou fraude, não para prever)."

## Contexto: o que cada família pode e não pode fazer pelo gerador

O ponto de partida não é negociável (Constituição, Princípio I): em sorteio
honesto, **toda** combinação tem a mesma chance de ganhar, e nada no histórico
muda isso (teorema da invariância). Esta feature não promete aumentar a chance
de ganhar. Ela usa cada família do texto naquilo que ela de fato entrega:

| Família | O que ela realmente oferece | Papel nesta feature |
|---|---|---|
| A — estatística popular | Nada como previsão. Muito como **retrato do comportamento dos apostadores**: quem escolhe datas, padrões e "números quentes" concentra apostas e divide prêmios. | (1) Medir com dado brasileiro real quais jogos são mais disputados e escolher os menos disputados; (2) pôr os métodos populares sob teste formal, como hipóteses. |
| B — cobertura | Garantias condicionais reais ("se t das suas dezenas saírem, algum jogo acerta t"), sem mudar o retorno esperado por real. | Lotes e fechamentos com contrato completo e honesto, incluindo trevos na +Milionária. |
| C — machine learning | Em sorteio i.i.d., nada além de sobreajuste ao ruído. | Hipóteses sob teste, com o sobreajuste medido e exibido. Nunca entram na geração sem aprovação replicada. |
| D — arbitragem estrutural | A única família que já deu lucro — por defeito de regra (acumulado acima do custo de cobrir tudo; roll-down anunciado). | Medir, a cada concurso, quanto de cada real volta, o que move esse número e se alguma regra brasileira cria a situação de Mandel ou do Cash WinFall (hoje não cria). |
| E — forense | Detectar viés ou fraude no equipamento. | Bateria de testes motivados pela física do sorteio. É o **único** caminho pelo qual um viés poderia entrar na geração — e só se for replicado. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Regras oficiais corretas e iguais nas duas modalidades (Priority: P1)

Quem usa o app vê chances, prêmios, garantias e valores calculados pelas regras
**vigentes** de cada modalidade: as 10 faixas da +Milionária (inclusive as de 3
e 2 dezenas com trevo, de valor fixo), a fração da arrecadação que vira prêmio,
a divisão entre as faixas, as regras de acúmulo, a Mega da Virada e a reserva
garantidora da +Milionária. O mesmo cálculo dá o mesmo número na web e no app
Android.

**Why this priority**: tudo o que vem depois (valor do concurso, estrutura do
lote, fechamentos, calibração da popularidade) é calculado em cima do modelo
de prêmios. Hoje a versão web reconhece 9 faixas da +Milionária que não são as
oficiais e diz "1 em 1.099" de chance de prêmio quando o correto é **1 em
11,39**; por isso não oferece a garantia de 3 dezenas, que paga. As duas
plataformas usam uma fração de prêmio desatualizada (43,35% contra os 43,79%
publicados hoje pela Caixa), e o app Android deduz a reserva da +Milionária na
ordem errada. Um laboratório que existe para refutar contas erradas não pode
partir de uma regra errada.

**Independent Test**: comparar o que o app exibe (chance de prêmio por faixa,
garantias oferecidas, retorno esperado num cenário de referência) com o cálculo
feito à mão a partir das regras oficiais publicadas, nas duas modalidades e nas
duas plataformas.

**Acceptance Scenarios**:

1. **Given** a +Milionária selecionada, **When** o usuário consulta a chance de
   uma aposta simples ser premiada, **Then** o app mostra 1 em 11,39,
   resultado das 10 faixas oficiais.
2. **Given** o modo Fechamento na +Milionária, **When** o usuário escolhe a
   garantia, **Then** aparecem todas as garantias que podem pagar pelas regras
   oficiais (inclusive 3 dezenas e 2 dezenas), cada uma com a condição de trevo
   escrita no contrato.
3. **Given** qualquer concurso, **When** o app calcula a divisão do prêmio,
   **Then** usa as frações vigentes (43,79% da arrecadação; Mega-Sena
   40/13/15 + 22% para finais 0 ou 5 + 10% para a Virada; Virada 90/5/5 sem
   acúmulo; +Milionária com 5% de reserva, depois os prêmios fixos, depois
   62/10/8/8/6/6), e a metodologia exibe a data e a fonte de cada regra.
4. **Given** um mesmo cenário de referência, **When** calculado pelo domínio
   web e pelo domínio Android, **Then** os resultados coincidem.

---

### User Story 2 - Jogos menos disputados, medidos com dado brasileiro real (Priority: P1)

O gerador continua entregando jogos com exatamente a mesma chance de ganhar de
qualquer outro jogo, mas escolhe, entre candidatos igualmente prováveis, os que
**menos gente joga** — para que, se ganhar, o prêmio seja dividido com menos
pessoas. A medida de "quanto um jogo é disputado" deixa de ser uma heurística
importada de estudos estrangeiros e passa a ser **estimada a partir do
histórico brasileiro de ganhadores por faixa** (a Caixa publica, por concurso,
quantas apostas acertaram cada faixa e quanto foi arrecadado), para as dezenas
e para os trevos. A medida calibrada só substitui a atual se passar numa
validação pré-registrada fora da amostra.

**Why this priority**: é a única alavanca que muda quanto o ganhador recebe
sem custar nada e sem tocar na chance. É a Família A usada do jeito certo — não
para adivinhar o sorteio, mas para medir os outros apostadores. Hoje a própria
metodologia do app admite que os pesos são heurísticos "porque a Caixa não
publica a distribuição de dezenas apostadas"; o número de ganhadores por
faixa, que ela publica, carrega exatamente essa informação.

**Independent Test**: rodar a validação pré-registrada (ajuste nos concursos
antigos, previsão do número de ganhadores nos concursos mais recentes e nos
concursos sorteados depois do pré-registro) e, conforme o resultado, verificar
que o gerador usa a medida calibrada ou mantém a heurística — exibindo em
qualquer caso que a chance de ganhar não mudou.

**Acceptance Scenarios**:

1. **Given** a medida calibrada aprovada na validação, **When** o usuário gera
   jogos em qualquer das duas modalidades, **Then** cada jogo mostra sua
   popularidade relativa e o ganho no prêmio condicional a ganhar, no mesmo
   painel da ressalva "isto não é chance de ganhar".
2. **Given** a medida calibrada reprovada, **When** o usuário gera jogos,
   **Then** o gerador mantém a medida atual e a metodologia informa, com os
   números da validação, que a calibração brasileira não passou.
3. **Given** a +Milionária, **When** o usuário gera jogos, **Then** as duplas de
   trevos também são escolhidas pela popularidade medida, ou o app informa que
   não foi possível detectar diferença de popularidade entre trevos.
4. **Given** muitos usuários gerando ao mesmo tempo, **When** o gerador
   escolhe os jogos, **Then** a escolha continua aleatória entre candidatos
   pouco disputados — nunca um "melhor jogo" único para todos, que o próprio
   app tornaria popular.

---

### User Story 3 - O valor de cada concurso, sem ilusão (Priority: P2)

Antes de gerar, o usuário vê quanto de cada real apostado volta, em média,
**neste** concurso (antes e depois do imposto de renda), a perda esperada do
lote que vai gerar, o que faz esse número subir ou descer (acumulado, concurso
de final 0 ou 5, Mega da Virada, reserva da +Milionária), quanto o acumulado
teria de valer para o retorno empatar com o custo, e o **teste de Mandel**:
quanto custaria cobrir todas as combinações e quanto isso devolveria. Na Mega
da Virada, vê também a chance de não haver ganhador da sena e o prêmio
"escorrer" para a quina, que é o mecanismo do Cash WinFall. O app explica que
escolher o concurso muda a perda por real, mas que nenhuma regra brasileira
vigente cria a situação de valor esperado positivo que Mandel e o Cash WinFall
exploraram.

**Why this priority**: o momento da aposta é a única alavanca que muda o
retorno esperado por real — escolher dezenas não muda. É a resposta honesta à
Família D: o mecanismo que funcionou lá fora é calculado aqui, concurso a
concurso, e o resultado é mostrado, seja qual for.

**Independent Test**: para concursos de referência (regular, final 0 ou 5,
Mega da Virada, +Milionária com reserva acionada), recalcular à mão, a partir
dos valores publicados e das regras oficiais, os números do painel.

**Acceptance Scenarios**:

1. **Given** a fonte de dados informa arrecadação e acumulados, **When** o
   painel de valor abre, **Then** mostra o retorno por real antes e depois do
   imposto, a perda esperada do lote em reais e o acumulado de equilíbrio,
   com o número de apostas do concurso estimado automaticamente (o usuário
   pode corrigir).
2. **Given** o próximo concurso da Mega-Sena termina em 0 ou 5, **When** o
   painel abre, **Then** o acúmulo especial entra no cálculo e é explicado.
3. **Given** a Mega da Virada, **When** o painel abre, **Then** aplica a
   divisão 90/5/5, mostra a chance de o prêmio da sena escorrer para a quina e
   o efeito disso no retorno.
4. **Given** a +Milionária, **When** o painel abre, **Then** aplica o prêmio
   mínimo garantido da faixa principal, o teto da reserva e a regra de repasse
   entre faixas sem ganhador.
5. **Given** qualquer concurso, **When** o usuário consulta o teste de Mandel,
   **Then** vê a razão retorno/custo de cobrir todas as combinações e o
   acumulado que a levaria a 1, e o app não sugere, em hipótese alguma, comprar
   todas as combinações.
6. **Given** a fonte de dados indisponível, ou um concurso especial com regra
   desconhecida, **When** o painel abre, **Then** declara que o valor não está
   disponível, em vez de estimá-lo com dado inventado.

---

### User Story 4 - Lote e fechamento com contrato honesto (Priority: P2)

Quando o usuário pede vários jogos, o lote é arranjado para maximizar a chance
de pelo menos um prêmio **pelo mesmo custo e o mesmo retorno esperado** — na
+Milionária, por exemplo, com duplas de trevos complementares — e o app mostra
essa chance exata. Quando o usuário monta um fechamento, vê o contrato
completo: a condição, a faixa garantida, o prêmio mínimo garantido em reais (ou
"rateio" quando o valor é variável), o custo, a chance de a condição acontecer
e o aviso de que o fechamento não muda o retorno esperado por real, só a forma
como os resultados se distribuem. Na +Milionária, o fechamento passa a
considerar os trevos na garantia.

**Why this priority**: a Família B é matematicamente séria, mas costuma ser
vendida com promessa enganosa. O papel do app é entregar a parte verdadeira
(a garantia condicional) com o contrato inteiro à vista.

**Independent Test**: para lotes e fechamentos de referência, conferir por
enumeração exaustiva a garantia, a chance de pelo menos um prêmio e o retorno
esperado, nas duas modalidades.

**Acceptance Scenarios**:

1. **Given** um lote de 3 jogos na +Milionária, **When** gerado, **Then** as
   duplas de trevos cobrem juntas os 6 trevos e o lote mostra sua chance exata
   de pelo menos um prêmio (25,4%, o máximo possível para 3 jogos, contra 25,1%
   com duplas sorteadas de forma independente, como hoje), com custo e retorno
   esperado inalterados.
2. **Given** um lote na Mega-Sena, **When** gerado, **Then** o app mostra a
   chance exata de pelo menos um prêmio e não atribui ao arranjo das dezenas
   um ganho que ele não tem (na Mega-Sena o ganho do arranjo é desprezível).
3. **Given** um fechamento, **When** gerado, **Then** o contrato mostra
   condição, faixa garantida, prêmio mínimo garantido, custo, chance de a
   condição acontecer e o aviso sobre o retorno esperado.
4. **Given** um fechamento da +Milionária com garantia de trevo, **When**
   gerado, **Then** a condição de trevos está escrita no contrato e a garantia
   foi conferida exaustivamente para todos os sorteios possíveis.

---

### User Story 5 - Laboratório de hipóteses: métodos populares e machine learning sob teste (Priority: P3)

Os métodos populares (quentes, frias, atrasadas, faixa de soma, paridade,
padrões do volante) e representantes de machine learning e séries temporais
passam pelo teste de previsibilidade pré-registrado do app (seleção numa parte
do histórico, confirmação numa parte reservada e nos concursos futuros) nas
**duas** modalidades, inclusive nos trevos. O resultado de cada um é publicado
com o mesmo destaque, aprovado ou não. Para os modelos de machine learning, o
relatório mostra lado a lado o desempenho dentro da amostra e fora dela — o
retrato do sobreajuste.

**Why this priority**: tem valor educativo e científico, e mantém o app honesto
sobre os métodos mais vendidos. Não muda a geração, a menos que algum método
seja aprovado e replicado — o que a teoria prevê que não acontecerá.

**Independent Test**: rodar o laboratório sobre históricos simulados honestos
(nenhuma estratégia pode ser aprovada além da taxa de erro declarada) e sobre
históricos simulados com viés plantado (a estratégia correspondente tem de ser
aprovada), e depois sobre o histórico real.

**Acceptance Scenarios**:

1. **Given** o laboratório, **When** executado em qualquer modalidade, **Then**
   lista cada estratégia com o resultado da seleção, da confirmação e o
   veredito, e "não aprovado" aparece com o mesmo destaque que uma aprovação
   teria.
2. **Given** um preditor de machine learning, **When** avaliado, **Then** o
   relatório mostra o desempenho dentro e fora da amostra e sinaliza o
   sobreajuste quando a diferença é significativa.
3. **Given** nenhuma estratégia aprovada, **When** o usuário gera jogos,
   **Then** nenhuma delas influencia a geração.
4. **Given** históricos simulados, **When** o laboratório roda, **Then** aprova
   no máximo 5% das vezes sob sorteio honesto e pelo menos 80% das vezes
   quando há o viés plantado correspondente.

---

### User Story 6 - Auditoria forense do sorteio, o único portão para um viés chegar à geração (Priority: P3)

A auditoria ganha testes motivados pela física do sorteio: a era de **dois
globos** da Mega-Sena (dezena e unidade sorteadas em globos separados, até o
concurso 1.140), a **ordem** em que as bolas saem (sinal de mistura
insuficiente), a homogeneidade entre **locais e eras** de sorteio,
**periodicidades** (como o rodízio de jogos de bolas) e concursos com número
**anômalo de ganhadores** (o sinal que denunciou a fraude da loteria da
Pensilvânia em 1980). Cada teste é pré-registrado, validado por controles
negativo e positivo, e informa o menor efeito que conseguiria detectar. Só um
viés detectado no **regime atual** de equipamento e **replicado** em concursos
posteriores pode alterar a geração; fora disso, a geração continua uniforme.

**Why this priority**: é o uso científico legítimo do histórico. Também é a
única porta de entrada aceitável para um viés na geração — e, sem ela, qualquer
"ajuste" seria a Família A disfarçada.

**Independent Test**: rodar a bateria sobre históricos simulados honestos e
com defeitos plantados (bola mais pesada num globo, mistura fraca, conjunto de
bolas viciado em rodízio, troca de local), conferir taxas de falso positivo e
de detecção, e depois rodar sobre o histórico real.

**Acceptance Scenarios**:

1. **Given** a auditoria, **When** executada, **Then** cada teste novo mostra
   estatística, p-valor corrigido, poder, menor efeito detectável e veredito,
   nas modalidades e eras em que se aplica.
2. **Given** uma anomalia restrita a uma era de equipamento que não está mais
   em uso, **When** a geração roda, **Then** ela não é afetada, e o relatório
   explica por quê.
3. **Given** uma anomalia no regime atual que replica em concursos posteriores,
   **When** a geração roda, **Then** o app mostra a evidência e o ajuste
   aplicado, limitado ao tamanho do efeito estimado; sem replicação, nada muda.
4. **Given** históricos simulados, **When** a bateria roda, **Then** a taxa de
   falso positivo fica no nível declarado e cada defeito plantado é detectado
   em pelo menos 80% das vezes.

---

### Edge Cases

- **Fonte de dados fora do ar**: a geração continua funcionando com a medida de
  popularidade embutida; o painel de valor do concurso informa que está
  indisponível e por quê.
- **Concursos antigos sem arrecadação publicada** (Mega-Sena antes de ~2009):
  ficam fora da calibração da popularidade e do modelo de demanda, e isso é
  declarado.
- **Mudanças de preço ao longo do histórico**: o número de apostas de cada
  concurso depende do preço vigente na data; erros de data de reajuste não
  podem distorcer a calibração.
- **Faixa sem ganhador**: na Mega-Sena o valor acumula na mesma faixa do
  concurso seguinte; na +Milionária, o valor das faixas 2 a 6 desce para a
  faixa seguinte, e o da faixa 6 vai para a faixa 1 do concurso seguinte.
- **Reserva da +Milionária**: completa o prêmio mínimo de R$ 10 milhões
  líquidos; acima de R$ 100 milhões, o excedente vai para o prêmio principal
  seguinte; sem uso por 12 meses, o saldo é incorporado ao prêmio principal.
- **Concurso especial com regra desconhecida** (ex.: concursos comemorativos):
  o valor é declarado indisponível, nunca estimado com a regra de outro
  concurso.
- **Fontes oficiais divergentes ou desatualizadas**: prevalece a página atual
  da Caixa; a divergência e a data da conferência ficam registradas.
- **Imposto de renda**: alíquota e limite de isenção mudam por norma; o valor
  usado é datado e citado.
- **Efeito manada**: se muitos usuários do app jogarem os jogos "menos
  disputados", eles deixam de ser. A escolha aleatória entre candidatos e a
  recalibração periódica limitam o efeito.
- **Mudança de comportamento dos apostadores ao longo do tempo**: a medida
  calibrada tem data de validade e versão; uma calibração vencida é
  sinalizada.
- **Número de apostas informado pelo usuário fora do plausível**: é recusado
  com mensagem clara.
- **Lote maior que o espaço disponível** (ex.: fechamento pequeno, muitos
  jogos): o lote sai menor e o app avisa antes de gerar, como já faz.

## Requirements *(mandatory)*

### Functional Requirements

**Regras do jogo (fundação)**

- **FR-001**: O sistema MUST classificar acertos da +Milionária nas 10 faixas
  oficiais, inclusive 3+2, 3+1, 2+2 e 2+1 trevos, e tratar "6, 5 ou 4 dezenas
  com 1 ou nenhum trevo" como uma faixa só, como no regulamento.
- **FR-002**: O sistema MUST calcular a divisão do prêmio com as frações e a
  ordem de dedução vigentes de cada modalidade, incluindo prêmios de valor
  fixo, reserva garantidora, acúmulos especiais (finais 0 ou 5, Mega da
  Virada) e as regras de repasse entre faixas sem ganhador.
- **FR-003**: Cada regra numérica MUST ter fonte e data de conferência
  registradas e visíveis na metodologia; quando a regra vigente não puder ser
  confirmada, o valor dependente dela MUST ser declarado indisponível.
- **FR-004**: O sistema MUST oferecer, no modo Fechamento, todas as garantias
  que podem pagar prêmio pelas regras oficiais em cada modalidade, com a
  condição de trevos escrita no contrato da +Milionária.
- **FR-005**: Os domínios web e Android MUST produzir os mesmos números de
  chance, prêmio e retorno esperado para os mesmos cenários, verificado por
  teste automatizado.
- **FR-006**: Todos os cálculos que hoje ignoram os trevos ao avaliar acertos
  da +Milionária (backtest, benchmark, simulação de banca, teste de
  previsibilidade) MUST passar a considerá-los.

**Escolha dos jogos (valor condicional a ganhar)**

- **FR-007**: O gerador MUST manter, para cada jogo, chance de ganhar idêntica
  à de qualquer outra combinação; nenhuma etapa da geração pode favorecer
  dezenas por desempenho histórico sem aprovação do teste de previsibilidade.
- **FR-008**: O sistema MUST estimar a popularidade das combinações a partir do
  histórico real de ganhadores por faixa e de arrecadação, para dezenas e
  trevos, separando a parcela de apostas aleatórias (Surpresinha) da parcela
  escolhida pelos apostadores.
- **FR-009**: A medida calibrada MUST substituir a heurística atual somente se
  passar no critério de validação pré-registrado, fora da amostra e em
  concursos posteriores ao pré-registro; o resultado da validação MUST ser
  publicado na metodologia, aprovado ou não.
- **FR-010**: O gerador MUST escolher aleatoriamente entre candidatos pouco
  disputados, e não sempre o menos disputado, para não concentrar os usuários
  do app num mesmo jogo.
- **FR-011**: Na +Milionária, a escolha das duplas de trevos MUST usar a
  popularidade medida dos trevos quando ela for detectável; caso contrário, os
  trevos continuam uniformes, e o app informa isso.
- **FR-012**: Cada jogo gerado MUST mostrar popularidade relativa e ganho
  condicional a ganhar acompanhados, no mesmo painel, da ressalva de que isso
  não é chance de ganhar.
- **FR-013**: A medida calibrada MUST ter versão, período de dados usado e data
  de validade, e o app MUST sinalizar quando ela estiver vencida.

**Valor do concurso (momento da aposta)**

- **FR-014**: O sistema MUST obter, para o próximo concurso, a arrecadação do
  anterior, o acumulado, o acúmulo para finais 0 ou 5, a reserva da Virada e,
  na +Milionária, o saldo da reserva garantidora, quando a fonte os fornecer.
- **FR-015**: O sistema MUST estimar o número de apostas do próximo concurso
  a partir do histórico de arrecadação em função do prêmio anunciado, e só
  adotar essa estimativa se ela prever melhor que a arrecadação anterior,
  fora da amostra; o usuário MUST poder corrigir o número.
- **FR-016**: O sistema MUST mostrar o retorno esperado por real antes e
  depois do imposto de renda, a perda esperada do lote em reais e o acumulado
  de equilíbrio, considerando a divisão do prêmio entre acertadores.
- **FR-017**: O sistema MUST calcular o teste de Mandel (retorno esperado de
  cobrir todas as combinações dividido pelo custo, com imposto e rateio) e o
  acumulado que levaria essa razão a 1, sem jamais recomendar a compra.
- **FR-018**: Na Mega da Virada, o sistema MUST calcular a chance de não haver
  ganhador da sena e o efeito do repasse para as faixas seguintes no retorno
  esperado.
- **FR-019**: O painel de valor MUST explicar, em linguagem simples, por que
  o retorno do concurso é maior ou menor que o de um concurso típico, e que
  isso não muda a chance de nenhum jogo.
- **FR-020**: Quando algum dado necessário faltar ou a regra do concurso não
  for conhecida, o painel MUST declarar o valor indisponível.
- **FR-021**: O sistema MAY oferecer um aviso opcional, para quem assinar as
  notificações, caso um concurso atinja retorno esperado não negativo pelo
  cálculo conservador; a metodologia MUST informar, com o mesmo cálculo
  aplicado ao histórico, se isso já aconteceu e por quê.

**Estrutura do lote e fechamentos**

- **FR-022**: Para lotes de vários jogos, o sistema MUST maximizar a chance de
  pelo menos um prêmio sem alterar custo nem retorno esperado, e mostrar essa
  chance exata.
- **FR-023**: Na +Milionária, os jogos de um lote MUST receber duplas de
  trevos complementares sempre que isso aumentar a chance de pelo menos um
  prêmio.
- **FR-024**: O app MUST NOT apresentar o arranjo das dezenas de um lote como
  ganho de chance quando o ganho for desprezível (caso da Mega-Sena).
- **FR-025**: Todo fechamento MUST exibir condição, faixa garantida, prêmio
  mínimo garantido (ou "rateio"), custo, chance de a condição acontecer e o
  aviso de que o retorno esperado por real não muda.
- **FR-026**: Os fechamentos da +Milionária MUST oferecer garantia que inclua
  os trevos, conferida exaustivamente para todos os sorteios possíveis antes
  de ser entregue.
- **FR-027**: Fechamento e escolha de jogos pouco disputados MUST funcionar
  juntos, sem perda da garantia.

**Laboratório de hipóteses (Famílias A e C)**

- **FR-028**: O teste de previsibilidade MUST incluir, como hipóteses
  pré-registradas, os métodos populares (quentes, frias, atrasadas, faixa de
  soma, paridade, padrões do volante) e representantes de machine learning e
  séries temporais, nas duas modalidades e incluindo trevos.
- **FR-029**: Para cada preditor de machine learning, o relatório MUST mostrar
  o desempenho dentro e fora da amostra e sinalizar o sobreajuste.
- **FR-030**: Resultados reprovados MUST ser publicados com o mesmo destaque que
  uma aprovação teria.
- **FR-031**: O sistema MUST NOT deixar estratégia alguma do laboratório
  influenciar a geração sem aprovação replicada, verificado por teste
  automatizado.
- **FR-032**: O laboratório MUST ser validado por controles negativo e
  positivo antes de rodar sobre o histórico real.

**Auditoria forense (Família E)**

- **FR-033**: A auditoria MUST incluir testes pré-registrados para: dígitos de
  dezena e unidade na era de dois globos da Mega-Sena; ordem de extração das
  bolas; homogeneidade entre locais e eras de sorteio; periodicidades; e
  concursos com número anômalo de ganhadores.
- **FR-034**: Cada teste MUST reportar estatística, p-valor corrigido para
  múltiplas comparações, poder e menor efeito detectável.
- **FR-035**: Cada teste MUST ter controle negativo e controle positivo
  passando antes de rodar sobre o histórico real.
- **FR-036**: Só um viés detectado no regime de equipamento vigente e
  replicado em concursos posteriores ao pré-registro MAY alterar a geração, com
  ajuste limitado ao efeito estimado e com a evidência exibida.
- **FR-037**: O sinal de "ganhadores anômalos" MUST ser apresentado como
  triagem (erro de dado, padrão atípico de apostas ou falha do modelo), nunca
  como acusação de fraude.

**Transversais**

- **FR-038**: Todo critério estatístico novo MUST ser pré-registrado e
  versionado antes da primeira análise do dado real correspondente.
- **FR-039**: Todo dado usado MUST declarar procedência (oficial, espelho de
  terceiros, sintético) e as ressalvas correspondentes.
- **FR-040**: Telas, textos e documentos MUST NOT afirmar nem sugerir que
  algum método aumenta a chance de ganhar.
- **FR-041**: Todas as funcionalidades MUST valer igualmente para Mega-Sena e
  +Milionária, salvo onde a regra da modalidade não se aplica (ex.: dois
  globos só existiu na Mega-Sena), e essa exceção MUST ser declarada.
- **FR-042**: A documentação do método MUST ser atualizada junto com cada
  mudança de comportamento e explicar o papel de cada família.

### Key Entities *(include if feature involves data)*

- **Regra oficial da modalidade**: preço, fração da arrecadação para prêmios,
  faixas (dezenas e trevos), forma de pagamento de cada faixa (rateio ou valor
  fixo), reservas, acúmulos especiais, regras de repasse, imposto; cada valor
  com fonte e data.
- **Panorama do concurso**: número, data, arrecadação do anterior, acumulados
  (geral, finais 0 ou 5, Virada), saldo da reserva da +Milionária, prêmio
  estimado, indicação de concurso especial.
- **Histórico de rateio**: por concurso, arrecadação, número de ganhadores e
  valor pago por faixa, ordem de extração das bolas, local do sorteio.
- **Medida de popularidade**: estimativa de quanto cada combinação é jogada
  (dezenas e trevos), com parcela aleatória, versão, período de dados,
  resultado da validação e validade.
- **Avaliação de valor**: retorno por real antes e depois do imposto, perda
  esperada do lote, acumulado de equilíbrio, razão de Mandel, chance de
  repasse na Virada.
- **Plano de lote**: jogos, duplas de trevos, estrutura escolhida, chance de
  pelo menos um prêmio, custo, retorno esperado.
- **Contrato de fechamento**: condição (dezenas e trevos), faixa garantida,
  prêmio mínimo, custo, chance da condição, verificação exaustiva.
- **Estratégia sob teste**: família (A ou C), regra de escolha, versão do
  pré-registro, resultado da seleção e da confirmação, sobreajuste.
- **Teste forense**: hipótese física, modalidade e era a que se aplica,
  critério pré-registrado, resultado, poder e menor efeito detectável.
- **Pré-registro**: versão, data (commit), constantes congeladas (alfa,
  cortes, critérios de aceitação), conjunto de confirmação prospectivo.
- **Decisão do portão forense**: estado (sem viés / viés antigo / viés
  vigente replicado), ajuste permitido e evidência associada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A chance de uma aposta simples ser premiada aparece como 1 em
  11,39 na +Milionária e 1 em 2.298 na Mega-Sena, idêntica ao cálculo
  independente feito a partir das regras oficiais.
- **SC-002**: Em 5 cenários de referência por modalidade, o retorno esperado
  por real calculado pelo app coincide com o cálculo manual a partir das
  regras oficiais com diferença de no máximo R$ 0,01 por aposta, e é idêntico
  nas plataformas web e Android.
- **SC-003**: 100% das opções de geração e de fechamento estão disponíveis nas
  duas modalidades, e nenhum cálculo de prêmio da +Milionária ignora os trevos.
- **SC-004**: A medida calibrada de popularidade só entra em uso se reduzir o
  erro de previsão do número de ganhadores por faixa na margem pré-registrada,
  tanto na parte reservada do histórico quanto em concursos sorteados depois
  do pré-registro; o resultado é publicado nos dois casos.
- **SC-005**: Em lotes de 3 jogos da +Milionária, a chance de pelo menos um
  prêmio passa de 25,1% para pelo menos 25,4% (e de 4 jogos, para pelo menos
  32,9%), sem mudança de custo nem de retorno esperado.
- **SC-006**: Todo instrumento estatístico novo apresenta taxa de falso
  positivo de no máximo o nível declarado mais 1 ponto percentual em pelo
  menos 1.000 históricos honestos simulados, e detecta o efeito plantado
  pré-registrado em pelo menos 80% das simulações.
- **SC-007**: Nenhuma tela afirma ou sugere chance maior de ganhar, e 100% dos
  números de valor exibidos (retorno, ganho condicional, razão de Mandel,
  chance de repasse) aparecem com a ressalva no mesmo painel, conferido por
  revisão de conteúdo.
- **SC-008**: Gerar um lote continua levando menos de 1 segundo num celular
  intermediário, e o painel de valor aparece em até 2 segundos após os dados
  do concurso estarem disponíveis.
- **SC-009**: Todo pré-registro tem data anterior à primeira análise do dado
  real correspondente, verificável pelo histórico do repositório.

## Assumptions

- O produto publicado (app web) é o alvo principal desta feature. O domínio do
  app Android acompanha nas regras de prêmio e na medida de popularidade, que
  passam a ser dados compartilhados e testados nas duas plataformas; telas
  novas no Android ficam para uma feature seguinte.
- A fonte de dados é a mesma API pública já usada pelo app (de terceiros), com
  a API oficial da Caixa como conferência. Ambas expõem, por concurso,
  arrecadação, ganhadores por faixa, ordem de extração e local do sorteio
  (estrutura conferida em 2026-10-06).
- O app não compra apostas nem se integra a canais de venda; o teste de Mandel
  é só um indicador.
- Modelos de aprendizado profundo (LSTM e similares) não serão implementados:
  representantes leves bastam para testar a hipótese, e a teoria prevê o mesmo
  resultado nulo para qualquer modelo.
- Numerologia entra como comportamento dos apostadores (preferência por datas
  e números "da sorte"), não como preditor: depende de dados pessoais e é nula
  pelo teorema da invariância.
- Quando fontes oficiais divergem, prevalece a página atual da Caixa; o
  limite de isenção do imposto de renda sobre prêmios será confirmado na fonte
  oficial durante a implementação.
- O resultado esperado do laboratório (A e C) e da auditoria (E) é "nenhuma
  vantagem e nenhum viés", e esse é um resultado aceitável e publicável.
