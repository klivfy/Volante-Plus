# Feature Specification: Modalidade Quina com o mesmo protocolo de backtesting

**Feature Branch**: `003-quina-lottery`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Acrescentar a modalidade Quina às loterias suportadas (Android, desktop via shared/ e app web), com o mesmo princípio de backtesting já usado para Mega-Sena e +Milionária: histórico oficial completo embutido e sincronização incremental, geração de jogos, corte de data, métricas de eficácia/variância/desvio padrão, controles negativo e positivo, sem nenhuma alegação preditiva sem evidência replicada (Constitution, Princípios I, III e V)."

## Contexto

O Volante+ hoje cobre duas modalidades: Mega-Sena (6 dezenas de 1–60) e
+Milionária (6 dezenas de 1–50 mais 2 trevos de 1–6). A Quina é a terceira
loteria numérica de maior alcance da Caixa e tem uma forma própria: **5
dezenas sorteadas de 1–80**, sem trevo, com sorteios de segunda a sábado — o
que dá um histórico muito mais longo e mais denso que o das outras duas.

O ponto de partida é o mesmo de sempre (Constituição, Princípio I): em sorteio
honesto, toda combinação tem a mesma chance de ganhar, e nada no histórico
muda isso. Acrescentar a Quina **não** promete aumentar a chance de ganhar;
acrescenta mais um domínio onde o laboratório pode testar, com o mesmo rigor,
hipóteses que o mundo repete — e, se elas falharem, dizer isso com clareza.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Backtesting da Quina sobre o histórico oficial completo (Priority: P1)

Quem usa o app escolhe a **Quina** ao lado de Mega-Sena e +Milionária,
configura a data de corte e a estratégia, e recebe o mesmo relatório de
backtesting que já recebe nas outras modalidades (eficácia, variância, desvio
padrão, comparação com o acaso), calculado sobre o histórico real da Quina
desde o primeiro concurso. O histórico já nasce embutido no app, funcionando
sem rede, e fica no último concurso por sincronização incremental.

**Why this priority**: é o núcleo do pedido ("mesmo princípio de
backtesting"). Sem histórico completo e um relatório honesto, a Quina seria só
um volante a mais, não uma modalidade do laboratório.

**Independent Test**: com o app recém-instalado e sem rede, escolher a Quina,
definir uma data de corte e gerar o relatório; conferir que o histórico usado
vai do concurso 1 ao último do seed e que as métricas aparecem como nas outras
modalidades.

**Acceptance Scenarios**:

1. **Given** uma instalação nova sem conectividade, **When** o usuário seleciona
   a Quina e abre o backtesting, **Then** o histórico completo da Quina (do
   concurso 1 ao último embutido) está disponível e o relatório é gerado sem
   erro de rede.
2. **Given** o relatório da Quina, **When** o usuário o lê, **Then** ele traz as
   mesmas métricas e a mesma comparação com o acaso das outras modalidades, e
   nunca apresenta o resultado como previsão.
3. **Given** um app já instalado e sincronizado antes desta feature, **When** é
   atualizado, **Then** o histórico de Mega-Sena e +Milionária já salvo não é
   apagado, duplicado nem alterado, e a Quina passa a existir ao lado delas.
4. **Given** a data de corte escolhida, **When** o backtesting da Quina roda,
   **Then** nenhum concurso posterior ao corte entra na etapa de
   "aprendizado" da estratégia (mesma regra anti-vazamento das demais).

---

### User Story 2 - Gerar jogos da Quina pelas regras do volante (Priority: P2)

O usuário monta jogos da Quina no volante (jogos avulsos e fechamento), com as
regras oficiais da modalidade: universo de 80 dezenas, aposta de 5 a 15
dezenas, sem trevo; vê o custo, as faixas de premiação (quina, quadra, terno e
duque) e a chance de cada uma calculada corretamente. As estratégias
disponíveis são as mesmas das outras modalidades e, como nelas, a ponderação
vinda do backtesting é apresentada como o que é: hipótese testada, não
promessa.

**Why this priority**: sem o volante, a Quina não é utilizável como produto;
mas depende do domínio (regras, prêmios) e do histórico da História 1.

**Independent Test**: no volante da Quina, tentar marcar menos de 5 e mais de
15 dezenas (recusado), marcar 5 e 15 (aceito), gerar um lote sem dezenas
repetidas dentro de cada jogo e conferir a chance de cada faixa com o cálculo
à mão.

**Acceptance Scenarios**:

1. **Given** o volante da Quina, **When** o usuário marca dezenas, **Then** só
   aceita números de 1 a 80 e só permite apostar com 5 a 15 dezenas.
2. **Given** um lote gerado, **When** o usuário o inspeciona, **Then** cada jogo
   tem dezenas distintas dentro do universo da Quina e o lote respeita a
   estratégia escolhida.
3. **Given** a Quina selecionada, **When** o usuário consulta chances e prêmios,
   **Then** vê as quatro faixas oficiais e a chance de uma aposta simples
   levar a quina é de 1 em 24.040.016.
4. **Given** o modo Fechamento, **When** o usuário o usa na Quina, **Then** o
   contrato de garantia mostrado vale para as dezenas e faixas da Quina, sem
   qualquer menção a trevos.

---

### User Story 3 - Instrumento validado por controles, sem alegação preditiva (Priority: P3)

Quem mantém o projeto tem a garantia de que o instrumento de backtesting,
rodando sobre a Quina, passa pelos mesmos controles negativo e positivo
exigidos pela Constituição: sobre dados sabidamente aleatórios ele **não**
acusa sinal além do esperado pelo acaso, e sobre dados com um viés conhecido
inserido ele **acusa**. Nenhum texto, rótulo ou ponderação da Quina afirma
poder preditivo; o que o app mostra sobre ela é sempre o resultado de um teste
e seus limites.

**Why this priority**: é o que impede o app de virar uma máquina de ilusões
ao ganhar a terceira modalidade; mas só tem sentido depois de a modalidade
existir (Histórias 1 e 2).

**Independent Test**: rodar a suíte de testes e confirmar que o controle
negativo da Quina (histórico simulado i.i.d.) não é marcado como sinal acima da
taxa de falso positivo declarada, e que o controle positivo (viés injetado) é
detectado.

**Acceptance Scenarios**:

1. **Given** um histórico simulado de Quina sem viés algum, **When** o
   instrumento roda, **Then** não conclui "há sinal" além da taxa de falso
   positivo documentada.
2. **Given** um histórico de Quina com um viés deliberado de tamanho
   conhecido, **When** o instrumento roda, **Then** o viés é detectado.
3. **Given** qualquer tela, relatório ou texto que mencione a Quina, **When** o
   usuário o lê, **Then** o aviso de que o sorteio é aleatório e de que o
   backtesting não prevê resultados aparece com o mesmo rigor das outras
   modalidades.

---

### User Story 4 - Histórico da Quina sempre atualizado e igual nas plataformas (Priority: P3)

Quem mantém o projeto atualiza o histórico embutido da Quina com **um único
passo repetível**, a partir de uma única fonte validada, e as plataformas
(web, Android e desktop) recebem exatamente os mesmos concursos — nunca
derivações independentes que divirjam com o tempo (Constituição, Princípio V).
Em uso, a sincronização incremental traz os concursos realizados depois da
versão embutida, preenchendo também lacunas antigas.

**Why this priority**: sustenta a História 1 no tempo, mas o valor imediato
(ter a Quina no app) já existe sem ela.

**Independent Test**: avançar o histórico de referência com concursos novos,
rodar o processo de atualização e conferir que web, Android e desktop passam a
cobrir o mesmo intervalo, com relatório de quantos concursos entraram e a data
do último.

**Acceptance Scenarios**:

1. **Given** o histórico de referência da Quina, **When** o processo de
   atualização roda, **Then** ele recusa produzir resultado parcial, vazio ou
   com lacuna na sequência, e relata quantos concursos incluiu e a data do
   último.
2. **Given** a Quina já embutida, **When** o app abre com rede, **Then** a
   sincronização busca só os concursos que faltam e valida cada um antes de
   gravar.
3. **Given** o mesmo intervalo de concursos, **When** se compara web, Android e
   desktop, **Then** dezenas e datas são idênticas.

### Edge Cases

- **Quina de São João e outros concursos especiais**: têm a mesma forma dos
  demais (5 dezenas) e entram no histórico como concursos comuns; o que muda
  neles é a regra de acúmulo/prêmio, tratada onde o prêmio é calculado.
- **Concursos antigos (a partir de 1994)**: o histórico da Quina vai de uma
  época em que os sorteios eram mais espaçados; datas e dezenas dessa época
  devem passar na mesma validação que as recentes, sem tratamento especial
  oculto.
- **Volume**: a Quina tem milhares de concursos a mais que as outras
  modalidades (sorteios de segunda a sábado há anos); o backtesting e a
  abertura do app não podem ficar perceptivelmente mais lentos por isso.
- **Banco local que não conhece a Quina**: instalações antigas, com dados de
  Mega-Sena e +Milionária, atualizam sem perder nada.
- **Alternar entre modalidades**: a seleção de dezenas de cada aba é
  preservada ao trocar, como já é hoje.
- **Fonte sem o concurso mais recente**: o app mostra o que tem e diz que não
  conseguiu consultar, nunca inventa um concurso para "completar".
- **Concurso com dezenas fora do universo ou em quantidade errada** na fonte:
  é rejeitado na validação e nunca gravado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer a Quina como terceira modalidade, ao lado
  de Mega-Sena e +Milionária, em todas as plataformas que hoje oferecem as
  outras duas (web, Android e desktop).
- **FR-002**: O sistema MUST aplicar à Quina as regras oficiais da
  modalidade: 5 dezenas sorteadas de 1 a 80, ausência de trevo, aposta de 5 a
  15 dezenas.
- **FR-003**: O sistema MUST embutir o histórico oficial completo da Quina, do
  concurso 1 ao último coberto na geração, disponível sem rede desde a
  primeira execução.
- **FR-004**: O sistema MUST manter a Quina no último concurso por
  sincronização incremental que busca apenas o que falta, preenche lacunas
  antigas e só grava concursos que passam na validação estrutural.
- **FR-005**: O sistema MUST executar o backtesting da Quina com o mesmo
  protocolo das demais modalidades: data de corte sem vazamento do futuro,
  métricas de eficácia, variância e desvio padrão, e comparação com o
  desempenho esperado pelo acaso.
- **FR-006**: O sistema MUST permitir gerar jogos avulsos e fechamentos da
  Quina, com dezenas distintas em cada jogo e dentro do universo 1–80.
- **FR-007**: O sistema MUST calcular e exibir as quatro faixas de premiação
  da Quina (quina, quadra, terno e duque) e a chance de cada uma, de modo que
  o mesmo cálculo dê o mesmo número em todas as plataformas.
- **FR-008**: O sistema MUST validar o instrumento de backtesting sobre a Quina
  com controle negativo (dados sem viés não acusam sinal além do falso positivo
  declarado) e controle positivo (viés injetado é detectado), como parte da
  suíte automatizada.
- **FR-009**: O sistema MUST NOT afirmar, em nenhuma tela, relatório ou
  documento sobre a Quina, que o histórico permite prever ou melhorar a chance
  de acerto; qualquer ponderação derivada do histórico é rotulada como
  hipótese testada, com seus limites.
- **FR-010**: O sistema MUST derivar o histórico embutido de todas as
  plataformas de uma única fonte validada, por um processo repetível de um
  passo que recusa resultado parcial ou com lacunas e relata, por modalidade,
  quantos concursos incluiu e a data do último.
- **FR-011**: O sistema MUST declarar a procedência e as limitações do
  histórico da Quina (agregação de terceiros, não exportação oficial direta),
  como já faz para as outras modalidades.
- **FR-012**: A introdução da Quina MUST NOT alterar o histórico salvo nem os
  resultados de backtesting de Mega-Sena e +Milionária em instalações
  existentes.
- **FR-013**: A documentação do projeto (README, documentação do histórico e
  Roadmap) MUST refletir a Quina e como seu histórico se mantém atualizado.

### Key Entities

- **Modalidade Quina**: uma das loterias suportadas; definida por universo de
  dezenas (1–80), quantidade sorteada (5), faixa de aposta (5–15), ausência de
  trevo e tabela de premiação de quatro faixas.
- **Concurso da Quina**: um sorteio com número, data e as 5 dezenas sorteadas,
  parte do histórico oficial.
- **Histórico embutido da Quina**: cópia local, completa até a geração, do
  histórico oficial, carregada antes de qualquer sincronização.
- **Histórico de referência**: a cópia validada, fonte única do histórico
  embutido das três plataformas.
- **Relatório de backtesting da Quina**: eficácia, variância, desvio padrão e
  comparação com o acaso, para uma data de corte e estratégia.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Numa instalação nova e sem rede, o usuário gera um relatório de
  backtesting da Quina cobrindo do concurso 1 ao último do histórico embutido,
  sem erro de histórico insuficiente.
- **SC-002**: 100% dos concursos do histórico de referência da Quina estão nas
  três plataformas, com zero divergência de dezenas ou datas na faixa em comum.
- **SC-003**: Para uma aposta simples de 5 dezenas, o app informa 1 chance em
  24.040.016 de levar a quina, e as chances de quadra, terno e duque conferem
  com o cálculo exato à mão.
- **SC-004**: Na suíte automatizada, o controle negativo da Quina não acusa
  sinal acima da taxa de falso positivo declarada e o controle positivo é
  detectado em 100% das execuções de teste.
- **SC-005**: Os resultados de backtesting de Mega-Sena e +Milionária, para as
  mesmas entradas, são idênticos antes e depois desta feature.
- **SC-006**: Atualizar o histórico embutido da Quina, depois que o de
  referência avança, é uma operação de um único passo, concluída em poucos
  minutos, sem nova busca externa.
- **SC-007**: A abertura do app e a geração do relatório de backtesting da
  Quina não ficam perceptivelmente mais lentas que as das outras modalidades
  apesar do histórico bem maior.

## Assumptions

- As regras oficiais vigentes da Quina (universo, aposta de 5 a 15 dezenas,
  faixas de premiação, preço de referência da aposta) serão conferidas contra
  a fonte oficial na fase de planejamento; qualquer divergência com esta
  especificação prevalece a regra oficial.
- O histórico vem da mesma família de fontes de terceiros já usada para as
  outras modalidades, e a Quina herda as mesmas ressalvas de procedência
  (Princípio IV); validação cruzada contra uma segunda fonte independente,
  como nas outras modalidades, é desejável.
- A Quina entra com as estratégias de geração que Mega-Sena e +Milionária
  oferecem hoje. A evolução dos métodos de geração prevista na feature
  `002-generation-five-families` não é pré-requisito, e estendê-la à Quina é
  trabalho posterior.
- O desktop consome o domínio compartilhado (Princípio V); onde ele mantém
  seed e sincronização próprios, a Quina os recebe pelo mesmo mecanismo que
  as outras modalidades já usam ali.
- Fora de escopo: mudar as regras de Mega-Sena ou +Milionária, novos métodos
  de geração, e qualquer outra modalidade (Lotofácil, Dupla Sena etc.).
