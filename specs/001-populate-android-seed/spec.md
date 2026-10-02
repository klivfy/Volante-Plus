# Feature Specification: Seed Completo do Histórico Oficial no Android

**Feature Branch**: `001-populate-android-seed`

**Created**: 2026-10-02

**Status**: Draft

**Input**: User description: "Popular app/src/main/assets/seed/ (megasena.csv e maismilionaria.csv) com o histórico oficial completo de cada modalidade, eliminando o item pendente do Roadmap do README. Reaproveitar o histórico já validado em web/src/data/history/*.json (gerado e cruzado contra um espelho independente), convertendo para o formato CSV que app/src/main/assets/seed/README.md e CsvDrawParser já definem. Incluir o próprio mecanismo de geração/atualização do CSV a partir da fonte web, não só o arquivo gerado uma vez. Fora de escopo: mudar a sincronização incremental via API, o formato de Draw/Room, ou buscar dado de uma fonte diferente da já validada no app web."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - App Android nasce completo, mesmo sem rede (Priority: P1)

Quem instala o app Android pela primeira vez, numa rede ruim ou instável, ou
mesmo totalmente offline, encontra o histórico oficial completo de Mega-Sena e
+Milionária já disponível — desde o primeiro concurso de cada modalidade —
assim que abre a tela de Backtesting ou gera um lote. A sincronização com a
API da Caixa só precisa trazer os concursos realizados depois da versão
embutida do histórico, não milhares de concursos antigos.

**Why this priority**: é o próprio motivo da feature e o item que falta no
Roadmap do projeto. Sem isso, o app Android é a única das três plataformas
(web, desktop, Android) que ainda depende de rede para ter um histórico útil
logo na primeira execução — o app web e o desktop já resolveram isso.

**Independent Test**: instalar o app num dispositivo/emulador com a rede
desligada, abrir a tela de Backtesting e confirmar que o histórico mostrado
cobre do primeiro concurso de cada modalidade até o último presente no seed
embutido, sem nenhuma chamada de rede ter sido necessária.

**Acceptance Scenarios**:

1. **Given** uma instalação nova do app (banco local vazio), **When** o app
   inicia pela primeira vez, **Then** o histórico de Mega-Sena e o de
   +Milionária ficam disponíveis localmente, cobrindo cada um do concurso 1
   até o último presente no seed, sem exigir rede.
2. **Given** um dispositivo sem conectividade nenhuma, **When** o usuário
   abre a tela de Backtesting logo após instalar o app, **Then** o relatório
   é gerado normalmente sobre o histórico do seed, sem mensagem de erro de
   rede bloqueando o fluxo.
3. **Given** um usuário que já tinha o app instalado e sincronizado antes
   desta feature existir, **When** o app é atualizado, **Then** o histórico
   já sincronizado no dispositivo não é apagado nem duplicado pelo novo seed.

---

### User Story 2 - Seed do Android nunca diverge do histórico já validado na web (Priority: P2)

Quem mantém o projeto consegue atualizar o histórico embutido no Android
sempre que o histórico embutido no app web avança (novos concursos, correção
de algum dado), sem precisar buscar ou validar o dado oficial de novo — o
app web já fez essa validação (contiguidade desde o concurso 1, regras de
cada modalidade, conferência contra uma segunda fonte independente). O
processo de atualização é repetível e deixa claro, ao rodar, se o resultado
bate com a fonte de origem.

**Why this priority**: sem um mecanismo repetível, o seed do Android vira
um arquivo estático que some de vista e apodrece — o histórico volta a ficar
desatualizado silenciosamente, exatamente o problema que esta feature existe
para resolver de forma duradoura, não só uma vez.

**Independent Test**: com o histórico do app web já avançado (concursos
novos adicionados depois da última atualização do seed Android), rodar o
processo de atualização e confirmar que o seed do Android passa a cobrir os
mesmos concursos, sem buscar nenhum dado de uma fonte diferente da já usada
pela web.

**Acceptance Scenarios**:

1. **Given** o histórico do app web contém concursos mais recentes que o
   seed atual do Android, **When** o processo de atualização do seed roda,
   **Then** o novo seed do Android cobre, concurso por concurso, exatamente
   o mesmo intervalo (1 até o último) que o histórico do app web na hora da
   geração.
2. **Given** o processo de atualização do seed, **When** ele termina,
   **Then** relata quantos concursos foram incluídos por modalidade e a data
   do último concurso coberto, para quem o rodou conferir sem precisar abrir
   os arquivos gerados.

---

### User Story 3 - Um seed corrompido ou incompleto nunca chega a ser distribuído (Priority: P3)

Quem mantém o projeto tem uma garantia automatizada, antes do app ir para os
usuários, de que o histórico embutido não tem lacunas na sequência de
concursos, não viola as regras de nenhuma modalidade (universo de dezenas,
quantidade por concurso, trevos da +Milionária) e é de fato reconhecido
pelo app ao ser importado.

**Why this priority**: distribuir um histórico com erro silencioso (um
concurso faltando, uma dezena fora do universo válido) é pior do que não ter
seed nenhum — o app passaria a mostrar backtesting incorreto sem avisar
ninguém. É uma rede de segurança sobre as duas histórias anteriores, não a
entrega principal.

**Independent Test**: rodar a suíte de testes automatizados do projeto sobre
o seed gerado e confirmar que ela falha de forma clara se um arquivo de seed
tiver uma lacuna de concurso, uma dezena fora do universo válido da
modalidade, ou um número de trevo fora de 1–6 na +Milionária.

**Acceptance Scenarios**:

1. **Given** o seed gerado para uma modalidade, **When** a suíte de testes
   automatizados roda, **Then** ela confirma que a sequência de concursos é
   contígua do primeiro ao último, sem nenhum número de concurso faltando ou
   repetido.
2. **Given** um arquivo de seed deliberadamente corrompido (um concurso fora
   das regras da modalidade), **When** a suíte de testes roda sobre ele,
   **Then** o teste falha e aponta qual concurso/arquivo está inválido —
   nunca passa silenciosamente.

### Edge Cases

- O histórico do app web ainda não contém o concurso mais recente já
  realizado pela Caixa (ele próprio depende de sincronização): o seed do
  Android reflete o que a web tinha no momento da geração, nunca um dado
  inventado para "completar"; a defasagem é coberta depois pela
  sincronização incremental existente, como já acontece hoje.
- Uma instalação existente do app, com histórico parcial já sincronizado
  via API antes desta feature existir: o novo seed não deve sobrescrever
  nem duplicar concursos já salvos localmente.
- Geração do seed é rodada sem o histórico do app web estar presente/íntegro
  no repositório: o processo deve recusar gerar um seed incompleto ou
  vazio, em vez de produzir um arquivo truncado sem avisar.
- +Milionária tem trevos obrigatórios (2 por concurso); Mega-Sena não tem
  trevo nenhum — o processo de geração trata as duas modalidades sem
  confundir os formatos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O app Android MUST disponibilizar, numa instalação nova (banco
  local vazio), o histórico completo de Mega-Sena e de +Milionária — cada
  modalidade do seu primeiro concurso oficial até o último coberto pela
  geração do seed — sem exigir conectividade de rede.
- **FR-002**: O histórico embutido no Android MUST corresponder exatamente
  (mesmos concursos, mesmas dezenas, mesmos trevos, mesmas datas) ao
  histórico já validado e embutido no app web, para a mesma faixa de
  concursos — nunca uma segunda derivação independente do "histórico
  oficial" que possa divergir dela.
- **FR-003**: Deve existir um processo repetível para regenerar o histórico
  embutido do Android a partir do histórico (já validado) do app web, de
  forma que atualizar um não deixe o outro desatualizado por mais do que o
  tempo entre uma regeneração e outra.
- **FR-004**: O processo de geração MUST recusar produzir um resultado
  parcial, vazio ou com lacunas na sequência de concursos — uma falha deve
  ser visível a quem gera, nunca silenciosa.
- **FR-005**: O processo de geração MUST relatar, ao terminar, quantos
  concursos foram incluídos em cada modalidade e a data do último concurso
  coberto.
- **FR-006**: O histórico embutido MUST respeitar as regras de cada
  modalidade (quantidade e universo de dezenas da Mega-Sena e da
  +Milionária; 2 trevos distintos em 1–6 na +Milionária; nenhum trevo na
  Mega-Sena).
- **FR-007**: Uma instalação do app que já tinha histórico sincronizado via
  API antes desta feature MUST continuar funcionando normalmente após a
  atualização — o novo histórico embutido não MUST sobrescrever nem
  duplicar concursos já salvos localmente.
- **FR-008**: Deve existir verificação automatizada (parte da suíte de
  testes do projeto) que confirma a integridade do histórico embutido —
  sequência contígua de concursos, conformidade com as regras de cada
  modalidade — e que falha de forma clara e localizável quando isso não se
  sustenta.
- **FR-009**: A documentação do projeto (Roadmap do README e a documentação
  do próprio histórico embutido) MUST refletir que este item está concluído
  e explicar, para quem for atualizar no futuro, como o histórico embutido
  do Android se mantém sincronizado com o do app web.

### Key Entities

- **Histórico embutido do Android**: a cópia local, por modalidade (Mega-Sena,
  +Milionária), do histórico oficial de concursos — cada concurso com seu
  número, data, dezenas sorteadas e, na +Milionária, os dois trevos.
  Carregado na primeira execução do app, antes de qualquer sincronização de
  rede.
- **Histórico de referência (app web)**: a cópia já validada do histórico
  oficial, mantida pelo app web, que serve de origem para gerar o histórico
  embutido do Android — a fonte da verdade que esta feature reaproveita em
  vez de reconstruir.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma instalação nova do app, sem rede nenhuma disponível desde
  o primeiro lançamento, mostra um relatório de backtesting coerente (sem
  erro de "histórico insuficiente") cobrindo o intervalo completo de
  concursos de cada modalidade presente no seed.
- **SC-002**: 100% dos concursos presentes no histórico de referência do app
  web, na faixa de datas coberta pela geração do seed, também estão
  presentes no histórico embutido do Android — zero concursos faltando,
  zero divergência de dezenas/trevos/data entre as duas plataformas na
  faixa em comum.
- **SC-003**: Regenerar o histórico embutido do Android, depois de o
  histórico do app web avançar, é uma operação de um único passo, concluída
  em poucos minutos, sem exigir nova busca ou nova validação contra uma
  fonte externa.
- **SC-004**: A suíte de testes automatizados do projeto detecta 100% dos
  casos de histórico corrompido testados (lacuna de concurso, dezena fora
  do universo, trevo inválido) antes que o app seja publicado.

## Assumptions

- O histórico já embutido no app web (`web/src/data/history/`) é aceito como
  a fonte de verdade para esta feature — a validação de que esse histórico
  corresponde ao oficial da Caixa já foi feita por aquela feature e não é
  refeita aqui.
- "Concluir o item do Roadmap" inclui tanto o histórico embutido em si
  quanto o mecanismo para mantê-lo atualizado — um arquivo gerado uma única
  vez e nunca mais atualizado não cumpre o espírito do item (ver User Story
  2).
- O comportamento de sincronização incremental via API do Android
  (`SyncDrawHistory`) não muda: ela continua responsável por trazer os
  concursos realizados depois da geração do seed embutido.
- O armazenamento local e o modelo de domínio do histórico de concursos no
  Android não mudam — esta feature só afeta como o histórico chega ao banco
  na primeira execução.
- Fora de escopo: alterar o comportamento de sincronização incremental via
  rede do Android, e buscar dado de qualquer fonte diferente da já validada
  no histórico de referência do app web.
