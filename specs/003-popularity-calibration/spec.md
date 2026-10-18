# Feature Specification: Calibração brasileira da medida de popularidade

**Feature Branch**: `003-popularity-calibration`

**Created**: 2026-10-18

**Status**: Draft

**Input**: Melhorar o modelo de geração "de modo a ser possível a geração de
números ainda mais precisos". Análise prévia concluiu que, sob sorteio
honesto, a única melhoria real disponível é escolher jogos **menos
disputados** — a chance de acertar é intocável (teorema da invariância) — e
que a medida de "quão disputado" usada hoje (`Unpopularity`) é uma
**heurística importada** de estudos holandeses e belgas: captura a direção do
efeito, mas não a magnitude no Brasil. Esta spec substitui a heurística por
uma **medida estimada do dado brasileiro real** que a Caixa publica.

## Contexto: por que isto é o próximo passo do gerador

A spec 002 (cinco famílias) já identificou o caminho na US-002 e nos
FR-008 a FR-013, mas deixou o procedimento de estimação em aberto. Desde
então o gerador padrão passou a sortear candidatos **uniformes** (a
estratégia por tiers de frequência virou legado de laboratório) e ganhou
duplas de trevos complementares — o que torna a popularidade a **única**
fonte de diferenciação entre os jogos emitidos. Calibrá-la é, portanto, a
melhoria de maior valor disponível para a geração.

O fato explorável: a Caixa publica, por concurso, o **número de ganhadores
de cada faixa** e a **arrecadação**. Sob escolha uniforme, o número de
acertadores de uma faixa é Poisson com média `N · q_faixa`, onde `N` é o
número de apostas (arrecadação ÷ preço) e `q_faixa` é a probabilidade média
de uma aposta cair na faixa. Como `q_faixa` é uma média sobre a distribuição
**real** das combinações apostadas, o excesso (ou falta) de ganhadores em
certos concursos carrega exatamente a informação da distribuição de escolhas
dos apostadores — incluindo quanto dela é Surpresinha (uniforme).

## User Scenarios & Testing

### User Story 1 - Medida calibrada com dado brasileiro (Priority: P1)

O gerador mantém o desempate por rateio, mas a penalidade de popularidade
deixa de ser a heurística atual e passa a ser um modelo de escolha do
apostador **ajustado aos concursos brasileiros**: mistura de uma parcela
uniforme (Surpresinha) com uma parcela de escolha enviesada (datas,
centro do volante, primos, recência, padrões visuais), com parâmetros
estimados por máxima verossimilhança sobre as contagens oficiais de
ganhadores por faixa e a arrecadação. A calibração vale para dezenas e
trevos, nas duas modalidades.

**Acceptance Scenarios**:

1. **Given** a calibração aprovada, **When** o usuário gera jogos, **Then**
   o painel de rateio mostra popularidade relativa e ganho condicional com
   **intervalo de confiança** (não um número pontual heurístico), e a
   metodologia informa versão, período de dados e data da calibração.
2. **Given** a +Milionária, **When** o usuário gera jogos, **Then** as
   duplas de trevos complementares consideram a popularidade medida dos
   trevos quando ela for detectável; caso contrário permanecem uniformes e
   o app informa (FR-011 da spec 002).
3. **Given** concursos sem arrecadação publicada (Mega-Sena anterior a
   ~2009), **When** a calibração roda, **Then** esses concursos ficam de
   fora e isso é declarado.

---

### User Story 2 - Portão pré-registrado (Priority: P1)

A medida calibrada **só substitui** a heurística se prever o número de
ganhadores por faixa melhor que a heurística, fora da amostra e em
concursos sorteados depois do pré-registro. O critério, as constantes e o
conjunto de confirmação são congelados **antes** da primeira análise do
dado real. O resultado é publicado na metodologia, aprovado ou não —
reprovada, a heurística permanece com os números da validação à vista.

**Acceptance Scenarios**:

1. **Given** a validação executada, **When** a calibração vence a
   heurística na margem pré-registrada nas duas janelas, **Then** ela entra
   na geração.
2. **Given** a calibração reprovada em qualquer janela, **When** o usuário
   gera jogos, **Then** a heurística continua em uso e a metodologia
   informa a reprovação com os números.
3. **Given** o histórico de commits, **When** a validação é auditada,
   **Then** o pré-registro é anterior à primeira análise do dado real
   correspondente (SC-009 da spec 002).

---

### User Story 3 - Objetivo de popularidade consciente das faixas (Priority: P2)

O desempate entre candidatos passa a pesar a popularidade **apenas nas
faixas de rateio**. Na +Milionária, as faixas 7–10 têm valor fixo (R$ 50,
R$ 24, R$ 12, R$ 6): dividir com outros acertadores não reduz nada nelas,
então popularidade é irrelevante ali. A função objetivo vira a soma, sobre
as faixas, de `P(faixa) · E[1/(1+K)] · bolo_da_faixa`, com peso zero nas
faixas fixas — usando as regras oficiais corrigidas pela spec 002 (US-001).

**Acceptance Scenarios**:

1. **Given** a +Milionária, **When** o gerador desempata candidatos,
   **Then** o critério ignora as faixas de valor fixo e o relatório exibe o
   ganho condicional por faixa.
2. **Given** a Mega-Sena, **When** o gerador desempata, **Then** o
   comportamento é equivalente ao atual (todas as faixas são de rateio).

---

### Edge Cases

- **API sem histórico de ganhadores**: a calibração declara indisponível e
  a heurística responde sozinha.
- **Reajuste de preço ao longo do histórico**: o número de apostas por
  concurso usa o preço vigente na data; erros de data de reajuste não podem
  distorcer a estimação.
- **Faixas sem ganhador** (frequente nas faixas altas): a verossimilhança
  trata zeros como dados, não como lacunas.
- **Concursos especiais** (Mega da Virada): mudam a arrecadação por outras
  razões; entram na estimação com indicador próprio ou ficam de fora,
  decisão pré-registrada.
- **Efeito manada do próprio app**: a escolha aleatória entre candidatos e
  a validade datada da calibração limitam o efeito; a recalibração
  periódica é parte do desenho.

## Requirements

- **FR-001**: O sistema MUST estimar, por máxima verossimilhança, os
  parâmetros do modelo de escolha do apostador (parcela uniforme + parcela
  enviesada) a partir das contagens oficiais de ganhadores por faixa e da
  arrecadação, por concurso, para Mega-Sena e +Milionária, dezenas e
  trevos.
- **FR-002**: O modelo MUST produzir uma popularidade relativa `m` por
  combinação com **intervalo de confiança**, e o painel de rateio MUST
  exibir ganho condicional com esse intervalo.
- **FR-003**: A calibração MUST ter versão, período de dados, validade e
  critério de aprovação pré-registrados; vencida, o app sinaliza.
- **FR-004**: O gerador MUST substituir a heurística pela calibração
  somente após aprovação na validação pré-registrada (fora da amostra e em
  concursos posteriores ao pré-registro); o resultado, aprovado ou não,
  MUST ser publicado.
- **FR-005**: O desempate entre candidatos MUST otimizar o valor esperado
  condicional a ganhar **por faixa de rateio**, com peso zero nas faixas de
  valor fixo da +Milionária.
- **FR-006**: A medida calibrada MUST valer para os trevos na +Milionária;
  sem diferença detectável, os trevos permanecem uniformes e o app informa.
- **FR-007**: Todo o pipeline MUST declarar procedência dos dados
  (oficial, espelho de terceiros, sintético) e as ressalvas
  correspondentes (FR-039 da spec 002).
- **FR-008**: Nenhuma tela ou texto MUST sugerir que a popularidade
  aumenta a chance de ganhar (FR-040 da spec 002).
- **FR-009**: Os domínios web e Android MUST usar a mesma calibração
  (dados compartilhados), verificada por teste de equivalência — a
  divergência de medidas entre plataformas é bug (Princípio V).

## Success Criteria

- **SC-001**: A calibração reduz o erro de previsão do número de
  ganhadores por faixa na margem pré-registrada, nas duas janelas de
  validação; caso contrário, a heurística permanece e o resultado negativo
  é publicado.
- **SC-002**: Em lotes de referência (5 por modalidade), o ganho
  condicional médio exibido coincide com o recálculo manual a partir do
  modelo ajustado com diferença máxima de 0,1 ponto percentual.
- **SC-003**: O ganho condicional reportado nunca é positivo em uma faixa
  de valor fixo da +Milionária.
- **SC-004**: Gerar um lote continua levando menos de 1 segundo num
  celular intermediário com a calibração em uso (SC-008 da spec 002).
- **SC-005**: 100% dos números de popularidade exibidos aparecem com a
  ressalva de que não alteram a chance de ganhar.

## Assumptions

- A API pública usada pelo app expõe, por concurso, arrecadação e
  ganhadores por faixa (estrutura conferida na spec 002, 2026-10-06).
- O modelo de mistura (Surpresinha uniforme + escolha enviesada) captura a
  maior parte da variação observada; componentes sem suporte nos dados são
  eliminados por seleção de modelo pré-registrada.
- A estimação roda offline no repositório (script versionado), não no app:
  o app consome o artefato calibrado.
- O resultado esperado é uma medida brasileira que mantém a direção da
  heurística com magnitude própria; um resultado "sem diferença
  detectável" é aceitável e publicável.
