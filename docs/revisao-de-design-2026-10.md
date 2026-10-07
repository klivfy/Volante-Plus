# Revisão de design e plano de ação — Volante+ web

**Data**: 2026-10-06 · **Versão analisada**: web 2.3.0 (`main` em `ce8ac8e`) ·
**Método**: skill `apple-design` (HIG da Apple + lente de craft), com as telas
renderizadas e medidas · **Escopo**: app web/PWA (`web/`); Android, desktop e
extensão ficam fora.

## 1. Resumo

**Avaliação: problemas críticos** — 3 achados críticos, 10 altos, 10 médios e 5 baixos.

A primeira revisão desta sessão foi feita só pelo código e chegou a "Boa".
Renderizar as quatro telas em 11 estados, com texto a 200%, em 320 px, em
tablet e em desktop mostrou o que o código sozinho escondia:

- texto cortado e rótulo de campo por cima do valor a 200%;
- estrutura de títulos e marcos quebrada para leitor de tela;
- modalidade que muda de cor mas não de seleção ao trocar de aba;
- um selo "ACUMULADA!" que aparece mesmo quando o concurso não acumulou;
- a página Sobre descrevendo um método de geração que o app deixou de usar
  na 2.3.0.

**Tese da tela principal**: gerar jogos sem ilusão. "Sem palpite, sem número
quente" é o maior ativo do produto, mas a hierarquia visual o contradiz. Depois
do botão, o que mais chama a atenção é o prêmio de R$ 92 milhões em verde com
um selo vermelho. O painel mais colorido destaca uma dezena (a 26) em laranja e
negrito.

**Assinatura**: hoje não há nenhuma. É o Material 3 de base com a cor da
modalidade trocada. A seção 4 propõe uma: o **mini-volante**.

## 2. Como a revisão foi feita

- **Build e navegador**: build de produção local (`npm run build && npm start`)
  e Chromium via Playwright, com os dados reais das APIs no momento da revisão
  (Mega-Sena até o concurso 3.066, +Milionária até o 395).
- **Estados (11)**:
  - Volante: inicial nas duas modalidades; lote gerado (Mega com 30 milhões de
    apostas informadas, +Milionária com 3 milhões); fechamento de 10 dezenas;
    detalhes da evidência abertos.
  - Backtesting antes e depois de rodar.
  - Análise avançada antes e depois de rodar todas as seções.
  - Sobre.
  - Fluxo de troca de modalidade entre as abas.
- **Variações**:
  - 390 × 844 em claro e escuro;
  - texto a 200% (`html { font-size: 200% }`, o mesmo que a preferência de
    fonte do navegador em 32 px);
  - 320 × 640;
  - 820 × 1180;
  - 1440 × 900 em claro e escuro.
- **Medições**:
  - axe-core 4.12 (WCAG 2.0, 2.1 e 2.2, A e AA, mais boas práticas) em 18
    estados (11 claros, 7 escuros);
  - script próprio para alvos menores que 44 px, texto cortado, rolagem
    horizontal, títulos, marcos e tamanhos de fonte;
  - percurso de teclado (Tab) no desktop;
  - contraste calculado pela fórmula da WCAG a partir das cores do tema.
- **Limites**:
  - Só Chromium. Área segura e tamanho de texto do iPhone não foram verificados
    em aparelho.
  - Não usei leitor de tela: a estrutura vem do DOM e do axe.
  - As telas da feature 002 ainda não existem; a seção 6 trata delas.
  - Os scripts de medição ficaram fora do repositório. A Fase 0 do plano os
    transforma em testes.

## 3. Achados

Cada achado tem o problema medido, a regra (citada como `arquivo.md › Seção`,
das páginas do HIG em `.claude/skills/apple-design/references/hig/`) e a
correção. Onde a regra vem da WCAG e não do HIG, isso está dito.

### Críticos

#### C1. Texto a 200%: informação cortada e rótulo por cima do valor

- **O quê**: com o texto a 200% em 390 px:
  - A linha "Concurso 3067 + ACUMULADA!" do cartão do próximo concurso vai até
    x = 430 px e é cortada pelo cartão. O selo aparece como "ACUMULA" e a data
    perde o final.
  - No campo "Apostas no concurso (opcional)", o rótulo fica sobre o número
    digitado.
  - Em Análise avançada, os cinco rótulos de campo saem com reticências.
    "Custo do bilhete (R$)", por exemplo, precisa de 302 px e tem 173.
  - As dezenas enchem a bolinha de borda a borda: a bola tem 36 px fixos e a
    fonte cresce.
- **Por quê**:
  - `accessibility.md › Vision`: "Ideally, give people the option to enlarge
    text by at least 200 percent".
  - `typography.md › Supporting Dynamic Type`: "Keep text truncation to a
    minimum as font size increases." e "Consider adjusting your layout at
    large font sizes."
- **Causa**:
  - `components/NextDrawCard.tsx:83` usa `Stack direction="row"` sem quebra.
  - O `InputLabel` do MUI posiciona o rótulo com `transform` em px, que não
    acompanha a fonte.
  - `components/NumberBall.tsx` tem o tamanho em px.
  - Os campos de valor esperado ficam em meia largura também no celular.
- **Correção**:
  - `useFlexGap` e `flexWrap: 'wrap'` na linha do concurso.
  - `transform` do `MuiInputLabel` em rem no tema, ou rótulo estático acima do
    campo.
  - `NumberBall` em rem.
  - Campos em coluna única abaixo de `sm`.

#### C2. Estrutura para leitor de tela: títulos, marcos e aba atual

- **O quê**:
  - O esboço de títulos da tela principal é: H1 "Volante+", H6 "Concurso
    3067", H6 "R$ 92.000.000", H6 "Quantos jogos", H6 "Rateio do prêmio", H4
    "+14.0%", H6 "O histórico favorece alguma dezena?" e H3 "Ver detalhes".
  - Sobre não tem `<main>` nem H1; o título é H5.
  - A barra inferior não é um `<nav>`. As quatro abas são `<button>` sem
    `aria-current`, então o leitor de tela não sabe qual página está aberta.
  - O axe acusa `heading-order` em todas as telas, e `landmark-one-main`,
    `page-has-heading-one` e `region` em Sobre.
- **Por quê**: `accessibility.md › Vision`: "Describe your app’s interface and
  content for VoiceOver." Pela WCAG, são falhas de 1.3.1 e 4.1.2, nível A.
- **Causa**:
  - O mapeamento padrão do MUI transforma `subtitle1` e `subtitle2` em `<h6>`.
  - `variant="h6"` e `variant="h4"` são usados só para estilo.
  - O `Accordion` do MUI envolve o resumo num `<h3>` por padrão.
- **Correção**:
  - `variantMapping` no tema, com `subtitle1` e `subtitle2` virando `p`.
  - `component` explícito nos títulos reais: um H1 por página e seções em H2.
  - `component="p"` no prêmio e no percentual.
  - `slotProps={{ heading: { component: 'div' } }}` no "Ver detalhes".
  - `Container component="main"` e H1 em Sobre.
  - Na barra, `Paper component="nav"` com `aria-label`, e itens como links
    (`component={Link}`) com `aria-current="page"`.

#### C3. Tabelas roláveis sem acesso pelo teclado

- **O quê**:
  - Em Análise avançada, a 390 px, a tabela de poder e a de estratégias são
    mais largas que o cartão. A de estratégias corta as colunas de p-valor e
    Bonferroni.
  - A 320 px, a de poder vai até 612 px.
  - As regiões roláveis não recebem foco, então quem usa teclado não alcança as
    colunas escondidas. O axe acusa `scrollable-region-focusable`, com
    gravidade "serious", em 2 regiões.
- **Por quê**:
  - WCAG 2.1.1 (teclado, nível A).
  - `lists-and-tables.md › Content`: "Consider ways to preserve readability of
    text that might otherwise get clipped or truncated."
- **Correção**:
  - Imediata: `TableContainer` com `tabIndex={0}`, `role="region"` e
    `aria-labelledby`.
  - Definitiva: linhas empilhadas no lugar da tabela no celular (M7).

### Altos

#### A1. A cor diz uma modalidade e o seletor diz outra

- **O quê**:
  - Ao escolher +Milionária no Volante e abrir Backtesting, a tela inteira fica
    azul (a cor da +Milionária), mas o seletor mostra Mega-Sena.
  - Ao voltar ao Volante, o seletor volta para Mega-Sena e os dados são da Mega
    (concurso 3067, R$ 92 milhões), mas as bolinhas dos jogos saem azuis.
- **Por quê**:
  - `color.md › Best practices`: "Avoid using the same color to mean
    different things."
  - `design-principles.md › Flexibility`: "Preserve a person’s context."
  - `tab-bars.md`: as abas deixam trocar de seção "while preserving the current
    navigation state within each section."
- **Causa**: cada página tem `useState<Lottery>(Lottery.MEGA_SENA)`
  (`app/page.tsx:67`, `app/backtesting/page.tsx:71`,
  `app/analise-avancada/page.tsx:57`). Só o tema é global
  (`LotteryThemeContext`).
- **Correção**: a modalidade passa a morar no contexto, como fonte única, com
  persistência no navegador. As páginas leem dali.

#### A2. "ACUMULADA!" aparece mesmo quando o concurso não acumulou

- **O quê**:
  - `components/NextDrawCard.tsx:79` define `isAccumulated = estimatedPrize >
    0`, o que vale para todo concurso.
  - A API traz o campo `acumulou`, que é falso em 661 dos 3.066 concursos da
    Mega. Depois do 3.048, que teve ganhador, o prêmio estimado do seguinte era
    R$ 3.500.000, e o app mostraria "ACUMULADA!" mesmo assim.
  - O selo usa a cor de erro (`color="error"`), caixa-alta e exclamação.
- **Por quê**:
  - `design-principles.md › Responsibility`: "Be fully transparent about what
    your product does and why."
  - `color.md › Best practices`, citado em A1: no resto do app, vermelho
    significa erro.
- **Correção**:
  - Ler `acumulou` em `services/caixaApi.ts` (novo campo `accumulated` em
    `NextDrawInfo`).
  - Mostrar "Acumulou", neutro, só quando for verdade.
  - Prêmio em texto de corpo, não como manchete verde.

#### A3. O app descreve um método que não usa

- **O quê**:
  - Sobre › "Como os jogos são gerados" diz que a geração sorteia 70% das vagas
    na faixa top, 20% na mid e 10% na low. Desde a 2.3.0, o padrão é escolher a
    menos popular entre 64 combinações uniformes (`engine/gameGenerator.ts:159`),
    e a própria tela principal diz isso.
  - Em Análise avançada, a estratégia `tier-weighted` aparece como "Método do
    app".
  - O botão "Usar estes dados para gerar jogos", no Backtesting, grava o
    desempenho calculado. A estratégia padrão só usa a lista de dezenas, não os
    valores. O botão promete um efeito que não existe.
- **Por quê**:
  - `design-principles.md › Responsibility`, citado em A2.
  - `buttons.md › Content`: "Ensure that each button clearly communicates its
    purpose."
- **Correção**:
  - Reescrever `sobre.howBody`.
  - Renomear a estratégia para "Faixas de frequência (método anterior)".
  - Remover o botão ou trocá-lo por um link para a explicação do método.

#### A4. Dois fechamentos, com resultados diferentes

- **O quê**:
  - Volante › Fechamento, com 10 dezenas e garantia de quadra, dá 20 jogos
    (R$ 120).
  - Análise avançada › Cobertura combinatória, com as mesmas 10 dezenas, dá 23
    jogos (R$ 138).
  - Na segunda, as dezenas são digitadas num campo de texto e o botão se chama
    "Gerar jogos do wheel".
- **Por quê**:
  - `design-principles.md › Familiarity`: "Keep visuals and interactions
    consistent".
  - `entering-data.md › Best practices`: "When possible, offer choices instead
    of requiring text entry."
- **Correção**: retirar a seção de Análise avançada e apontar para o modo
  Fechamento (recomendado), ou fazê-la chamar `generateClosure`.

#### A5. A afirmação é grande e a ressalva é letra miúda

- **O quê**:
  - No painel de rateio, "+14.0%" tem 22 px em negrito, e a ressalva ("Este
    número não é chance de ganhar…") tem 12 px.
  - Na +Milionária com 3 milhões de apostas, o mesmo destaque vai para "+0.3%".
  - A nota "Não aumenta a chance de ganhar" do cartão principal também está em
    12 px.
  - Na tela principal, 15 trechos estão em 12 px e o corpo do texto está em
    14 px. O padrão do HIG para celular é 17 pt.
- **Por quê**:
  - `typography.md › Ensuring legibility`: "Use font sizes that most people
    can read easily."
  - `typography.md › Conveying hierarchy`: "Adjust font weight, size, and
    color as needed to emphasize important information". Aqui a ênfase vai para
    o número, não para a ressalva.
  - Também contraria
    `specs/002-generation-five-families/contracts/ui-claims.md`, que exige que
    a ressalva tenha o mesmo tamanho e contraste do número que acompanha.
- **Correção**:
  - Componente `ClaimStatement`: afirmação e ressalva com o mesmo tamanho e a
    mesma cor, em texto de corpo.
  - Um limiar abaixo do qual o app diz "efeito desprezível" em vez de mostrar
    um percentual.

#### A6. Verde, laranja e vermelho julgando resultados estatísticos

- **O quê**:
  - Na tela principal, o painel de evidência é um alerta laranja de atenção,
    com "Fora do acaso após a correção: 26" em negrito — num app cujo subtítulo
    é "sem número quente".
  - No Backtesting, 0,603 contra 0,6 esperado ganha uma seta de alta verde.
  - O contrato do fechamento sai num alerta verde de sucesso.
  - Em Análise avançada, laranja para p = 0,026 e verde para "sem
    autocorrelação".
  - Na Mega-Sena, o verde já é a cor da modalidade e da ação principal.
- **Por quê**:
  - `color.md › Best practices`, citado em A1.
  - `feedback.md`: "match the significance of the information to the way it’s
    delivered."
- **Correção**:
  - Componente `VerdictCallout` neutro: fundo de superfície, ícone que muda pela
    forma e não pela cor.
  - Laranja só quando há algo a fazer, como dado desatualizado ou campo
    inválido.
  - Nenhuma seta para diferença dentro do ruído.
  - Contrato do fechamento em cartão neutro.

#### A7. No desktop, barra de abas na base e tudo esticado

- **O quê**:
  - Em 1440 px, a navegação continua numa barra fixa na base da janela.
  - A coluna única tem 1.200 px. Cada segmento do seletor tem cerca de 860 px
    de largura, e o botão "Gerar jogos", 840 px.
  - A 820 px (tablet), a barra também fica na base.
- **Por quê**:
  - `layout.md › Desktop (macOS)`: "Avoid placing controls or critical
    information at the bottom of a window."
  - `layout.md › Size classes`: "Consider taking advantage of larger spaces to
    switch from a tab bar to a sidebar".
  - `tab-bars.md › Tablet (iPadOS)`: "The system displays a tab bar near the
    top of the screen."
- **Correção**: a partir de 900 px, abas no topo (`AppBar` com `Tabs` como
  links) e duas colunas no Volante: um formulário fixo de cerca de 380 px e os
  resultados ao lado.

#### A8. Fechamento: custo só no fim, 20 cartões, 20 toques para copiar

- **O quê**:
  - O número de jogos e o custo (20 jogos, R$ 120) só aparecem depois de gerar.
  - O resultado são 20 cartões completos, e a página passa a ter 5.564 px de
    altura.
  - Copiar tudo exige 20 toques em "copiar".
- **Por quê**:
  - `design-principles.md › Agency`: "Stay out of the way."
  - `feedback.md › Best practices`: "Consider integrating status feedback into
    your interface."
- **Correção**:
  - Prévia do contrato ao vivo, abaixo do seletor, enquanto as dezenas são
    marcadas: jogos, custo e chance de a garantia valer.
  - Resultado numa lista compacta, uma linha por jogo, com números tabulares e
    os botões "Copiar todos" e "Compartilhar todos".

#### A9. O Backtesting começa com erro

- **O quê**:
  - A data de corte vem vazia. Tocar em "Executar backtest" mostra "Informe uma
    data de corte válida (aaaa-mm-dd)" num alerta separado, abaixo do cartão.
    O formato pedido não é o que o seletor de data mostra.
  - "Jogos por concurso" ainda é um slider de 3 valores, com polegar de 28 px.
    A tela principal já usa controle segmentado para o mesmo 2, 3 ou 4.
- **Por quê**:
  - `entering-data.md › Best practices`: "You can also prefill fields with
    reasonable default values, which can minimize decision making and speed
    data entry." e "Dynamically validate field values."
  - `writing.md › Best practices`: mostrar o erro "as close to the problem as
    possible".
- **Correção**:
  - Data padrão — por exemplo, a que deixa os últimos 300 concursos para
    validação.
  - Erro no próprio campo (`error` e `helperText`).
  - `SegmentedControl` no lugar do slider.

#### A10. Borda dos campos abaixo de 3:1

- **O quê**: a borda do `TextField` contornado é `rgba(0,0,0,.23)`. Dá 1,74:1
  sobre o fundo claro e 2,11:1 no escuro. Com o campo vazio, é a borda que
  mostra onde tocar.
- **Por quê**: WCAG 1.4.11 (contraste de elementos que não são texto, nível AA,
  mínimo de 3:1). O HIG trata do contraste de texto e ícones; esta regra vem da
  WCAG.
- **Correção**: borda `#7A807B` no claro (4,04:1) e `#8A918C` no escuro
  (5,15:1).

### Médios

#### M1. Números em formato americano ao lado de números em formato brasileiro

- **O quê**:
  - "15.6% a mais de prêmio", "+14.0%" e "0.53×" (`toFixed` em
    `engine/payoutShare.ts:227` e `components/PayoutSharePanel.tsx:57` e `:80`)
    aparecem ao lado de "0,54%" e "12,072".
  - Outros casos: "treino 2731" sem separador de milhar, "1 apostas
    premiadas", "-45,004%", "10^18" e "z-score" quebrado em duas linhas.
- **Por quê**: `writing.md › Best practices`: "Build language patterns."
- **Correção**:
  - `web/src/lib/format.ts`, tudo com `Intl` em pt-BR: porcentagem, decimal,
    inteiro, moeda e potência de 10 com sobrescrito.
  - Plural pelo i18n.

#### M2. Campo avançado no meio do fluxo principal

- **O quê**: "Apostas no concurso (opcional)" fica entre a quantidade de jogos
  e o botão, com texto de ajuda, mas só serve ao painel de rateio.
- **Por quê**:
  - `layout.md › Visual hierarchy`: "Use progressive disclosure".
  - `designing-for-ios.md › Best practices`: "limiting the number of onscreen
    controls while making secondary details and actions discoverable with
    minimal interaction."
- **Correção**: o campo vai para dentro do painel de rateio, como ajuste. A
  feature 002 (US3) passa a estimar esse número sozinha.

#### M3. Resultado abaixo da dobra, sem aviso

- **O quê**: em 390 × 844, depois de "Gerar jogos", o primeiro jogo começa em
  y ≈ 760, atrás da barra inferior. A tela não rola e nada é anunciado.
- **Por quê**: `feedback.md › Best practices`: "When it makes sense, confirm
  that a significant action or task has completed."
- **Correção**:
  - Rolar até "Jogos gerados" (instantâneo com "Reduzir movimento").
  - Foco no título da lista.
  - `aria-live` com "3 jogos gerados".

#### M4. Jargão e inglês

- **O quê**: a aba "Backtesting"; "Cobertura combinatória (wheeling)" e "Gerar
  jogos do wheel"; "Kelly Criterion"; as estratégias `tier-weighted`,
  `frequency-pure`, `cold-numbers`, `random-uniform` e `gap-maximizer`;
  "z-score"; "walk-forward"; "Taxa de eficácia".
- **Por quê**:
  - `writing.md › Getting started`: "Write for everyone… avoiding jargon".
  - `tab-bars.md › Best practices`: "Use single words whenever possible."
- **Correção (proposta)**:
  - Aba "Validação".
  - Estratégias: "Faixas de frequência", "Mais frequentes", "Atrasadas",
    "Sorteio uniforme" e "Distância máxima".
  - "Apostas premiadas" no lugar de "Taxa de eficácia".

#### M5. Cartão de jogo alto

- **O quê**: cada jogo ocupa cerca de 190 px para seis bolinhas — rótulo,
  bolas, uma linha de texto e uma fileira só para copiar e compartilhar.
- **Correção**: as ações vão para a linha do título ("Jogo 1", copiar,
  compartilhar), com cerca de 120 px de altura.

#### M6. Kelly e "banca"

- **O quê**:
  - Análise avançada pede "Banca disponível (R$)" e mostra "Kelly recomenda
    0,0% da banca". Isso trata a loteria como gestão de banca, num jogo de
    valor esperado negativo.
  - O custo padrão do bilhete é R$ 5, enquanto o fechamento usa R$ 6.
- **Por quê**: `design-principles.md › Responsibility`.
- **Correção**:
  - Retirar a parte de Kelly. A seção de valor esperado será substituída pelo
    painel de valor do concurso da feature 002 (US3).
  - Até lá, o custo padrão vem de `SIMPLE_BET_PRICE_BRL`.

#### M7. Tabelas no celular

- **O quê**: a tabela de poder mostra as colunas "40 · 100 · 500 · 1.000" sem
  dizer que são concursos. A de estratégias corta colunas.
- **Por quê**: `lists-and-tables.md › Content`: "Use descriptive column
  headings in a multicolumn table."
- **Correção**: no celular, linhas empilhadas (rótulo e valor) e cabeçalhos com
  a unidade.

#### M8. Distribuição de acertos em texto corrido

- **O quê**: "0×352 · 1×244 · 2×63 · 3×10 · 4×1" é o resultado central do
  Backtesting, e não há comparação visual com o esperado.
- **Por quê**: `charting-data.md › Best practices`: "Use a chart when you want
  to highlight important information about a dataset." e "Make every chart in
  your app accessible."
- **Correção**: barras observado × esperado (distribuição hipergeométrica), com
  tabela equivalente para leitor de tela.

#### M9. Três respostas para a mesma pergunta

- **O quê**:
  - Na tela principal: "1 dezena fora do que o acaso produz", em laranja.
  - Nos detalhes da mesma tela: "os dados sustentam com força que as dezenas
    saem com a mesma frequência (fator de Bayes de 10^18 a favor)".
  - Em Análise avançada: "desvio da uniformidade detectado (p = 0,026)".
- **Por quê**: `design-principles.md › Familiarity`: "Keep visuals and
  interactions consistent".
- **Correção**: é uma decisão de conteúdo, do dono da estatística — um veredito
  por pergunta, com os testes como detalhe.

#### M10. Verde-limão no modo escuro

- **O quê**: no escuro, o verde da Mega (#40BE00) preenche segmentos, botão e
  bolinhas sobre #1C1B1F. É o visual "quase preto com um acento verde-ácido",
  um dos padrões de interface genérica. O contraste passa (7,00:1); o problema
  é o peso.
- **Correção**: preenchimento #2E7D00 (texto branco 5,19:1; 3,21:1 contra a
  superfície escura) e o verde claro #7DD35A só em texto e ícones (8,98:1).

### Baixos

- **B1. Splash** — `branding.md › Best practices`: "Avoid using a launch
  screen as a branding opportunity." Remover o splash de 0,7 s. O comentário em
  `components/SplashScreen.tsx` ainda diz 2,5 s.
- **B2. Cor do bloco** — `msapplication-TileColor` é #6750A4, o roxo do
  Material, que não é cor da marca.
- **B3. Larguras** — o Volante usa `Container maxWidth="lg"`; Backtesting e
  Sobre usam `md`.
- **B4. Área segura** — a barra inferior não soma
  `env(safe-area-inset-bottom)`, e o viewport não declara `viewportFit:
  'cover'`. Conferir num iPhone com o app instalado; não dá para verificar no
  Chromium.
- **B5. Rótulos** — "Trevos 2-4" parece um intervalo ("de 2 a 4"): usar
  "Trevos 2 e 4". "Jogo 01" vira "Jogo 1".

### Notas de craft

- **Alto — sem ponto de vista**:
  - O fundo #FFFBFE rosado e o secundário #625B71 (os trevos estão nessa cor)
    são valores de base do Material 3. Os botões são pílulas de 20 px, e só a
    cor da modalidade muda. No escuro, vira verde-ácido sobre quase preto.
    Nada disso seria lembrado.
  - `branding.md › Best practices`: "Apply your app’s accent color
    judiciously." Hoje o verde está em seletores, botão, bolinhas, prêmio,
    ícones e alertas.
- **A honestidade está só no texto**: é o que o app tem de único, e a seção 4
  propõe levá-la para a forma.
- **Ousadia espalhada**: prêmio verde, selo vermelho, alerta laranja, alerta
  verde e seta verde. A proposta concentra a ousadia num lugar só, o volante, e
  deixa o resto quieto.
- **Um acessório a tirar**: a linha "Histórico completo: concursos 1 a 3066…",
  acima da dobra. Ela vira uma linha discreta dentro do cartão do concurso
  ("Dados até o concurso 3.066 · em dia").

### O que funciona (manter)

- **Contraste de texto**: zero violações de `color-contrast` do axe nos 18
  estados, claros e escuros.
- **Alvos de toque**:
  - Só um controle abaixo de 44 px em todas as telas: o polegar do slider do
    Backtesting, com 28 × 28 px, que é o mínimo do HIG.
  - O seletor de dezenas do fechamento tem alvos de 44 px e estado marcado
    nítido.
- **Sem rolagem horizontal da página** em 320, 390, 820 e 1440 px, nem a 200%.
- **Foco de teclado**: contorno de 2 px em todos os botões, e `aria-pressed`
  nos segmentos e nas dezenas.
- **Aparência e movimento**: claro e escuro por CSS, sem piscar; "Reduzir
  movimento" respeitado; fonte do sistema.
- **Texto honesto**: "Não aumenta a chance de ganhar" e o contrato do
  fechamento com a chance de a garantia valer são o maior ativo do produto.

### Notas de plataforma

- **Escopo do HIG**: é um app web/PWA. Valem os princípios e os fundamentos; as
  convenções nativas entram como referência — barra de abas embaixo no celular,
  abas no topo em tela grande.
- **Vidro e desfoque**: nenhuma camada pede. Se um dia a barra flutuar com
  `backdrop-filter`, oferecer alternativa sólida com
  `prefers-reduced-transparency`.
- **Tamanho de texto no iPhone**: o Safari do iPhone não aplica o tamanho de
  texto do sistema a páginas web, a não ser que a página use
  `font: -apple-system-body`. Hoje, quem aumenta o texto no iPhone depende do
  zoom de texto do Safari. Como o tema é todo em rem, adotar
  `-apple-system-body` no `html` faria o app seguir o tamanho de texto do
  sistema. Isso muda o tamanho base para todos no iOS, então precisa ser
  testado antes (tarefa D040).

## 4. Direção visual

### Tese

**O volante honesto**: o Volante+ mostra cada jogo como ele vai no papel e a
conta como ela é. A sensação procurada é calma e confiança, o oposto da
lotérica de cassino. Não há comemoração ao gerar, nem número em manchete
(`design-principles.md › Delight`: "Identify the emotion you want to
inspire.").

### Cores

Os papéis são fundo, superfície, conteúdo, contorno, cor da modalidade e
atenção. Os contrastes foram calculados pela fórmula da WCAG.

| Papel | Claro | Escuro |
|---|---|---|
| Fundo da página | #F4F5F3 | #121413 |
| Superfície (cartões) | #FFFFFF | #1C1F1D |
| Conteúdo | #1A1C1A — 17,14:1 na superfície | #E4E6E3 — 13,24:1 |
| Conteúdo secundário | #595E5A — 6,62:1 (6,05:1 no fundo) | #A9AFAA — 7,44:1 |
| Contorno de controle | #7A807B — 4,04:1 | #8A918C — 5,15:1 |
| Mega-Sena, preenchimento (texto branco) | #2B8300 — 4,83:1 | #2E7D00 — 5,19:1; 3,21:1 contra a superfície |
| Mega-Sena, texto e ícone | #2B8300 na superfície (4,83:1); #267500 no fundo (5,29:1) | #7DD35A — 8,98:1 |
| +Milionária, preenchimento (texto branco) | #005CA9 — 6,77:1 | #1F6AB8 — 5,51:1; 3,02:1 contra a superfície |
| +Milionária, texto e ícone | #005CA9 — 6,77:1 (6,19:1 no fundo) | #8CC4FF — 9,07:1 |
| Veredito (fundo neutro) | #EEF0EC — conteúdo 14,95:1, secundário 5,77:1 | #262A27 — 11,59:1 e 6,51:1 |
| Atenção (só quando há algo a fazer) | texto #7A4A00 sobre #FFF3DC — 6,81:1 | #F2C46B sobre #2B2416 — 9,43:1 |
| Volante: célula vazia e marca | #E3E7E1; marca da Mega 3,86:1, da +Milionária 5,41:1 | #2E332F; 6,95:1 e 7,02:1 |

Regras de uso:

- A cor da modalidade fica só na ação principal, na seleção e nas marcas do
  volante.
- Nenhum verde ou vermelho julga resultado estatístico.
- O verde da Mega sobre o fundo #F4F5F3 dá 4,41:1, abaixo do mínimo para texto.
  Como texto, ele só aparece sobre a superfície branca; sobre o fundo, use
  #267500.

### Tipografia

Uma família só, a do sistema. Uma fonte monoespaçada (`ui-monospace`) só na
lista copiável do fechamento. Tudo em rem, para acompanhar a preferência de
tamanho do usuário.

| Estilo | Tamanho / altura de linha | Peso | Uso |
|---|---|---|---|
| Título da página (H1) | 1.75rem / 2.25rem (28/36) | 700 | uma vez por página |
| Seção (H2) | 1.25rem / 1.75rem (20/28) | 600 | painéis |
| Corpo | 1.0625rem / 1.5rem (17/24) | 400 | texto, afirmações e ressalvas |
| Secundário | 0.9375rem / 1.375rem (15/22) | 400 | metadados |
| Nota | 0.8125rem / 1.125rem (13/18) | 400 | mínimo fora da barra de abas |
| Dezena na bola | 1rem, numa bola de 2.5rem | 600, tabular | jogos |
| Rótulo da barra de abas | 12 px fixos (de propósito) | 500/700 | só a barra |

Todos os números usam `font-variant-numeric: tabular-nums`: bolas, tabelas,
valores e listas.

### Layout

Celular (compacto): uma coluna, com a ação principal à vista e os detalhes
recolhidos.

```
┌────────────────────────────────┐
│ Volante+                       │
│ [  Mega-Sena  | +Milionária  ] │
│ ┌────────────────────────────┐ │
│ │ Concurso 3.067 · ter 06/10 │ │
│ │ R$ 92 milhões estimados    │ │
│ │ Acumulou · dados em dia    │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ [Jogos avulsos|Fechamento] │ │
│ │ Quantos jogos  [ 2 | 3 | 4]│ │
│ │ Não muda a chance de       │ │
│ │ ganhar: escolhe jogos      │ │
│ │ menos disputados. (17 px)  │ │
│ │ [       Gerar jogos       ]│ │
│ └────────────────────────────┘ │
│ 3 jogos gerados [Copiar todos] │
│ ┌────────────────────────────┐ │
│ │ Jogo 1            ⧉   ↗    │ │
│ │ ▫▫▫▫▪▫▫▫▫▫   05 12 23      │ │
│ │ ▫▪▫▫▫▫▫▫▫▫   34 47 58      │ │
│ │ ▫▫▪▫▫▫▫▫▫▫  (mini-volante) │ │
│ └────────────────────────────┘ │
│ ▸ Rateio do prêmio             │
│ ▸ O histórico favorece alguma  │
│   dezena?                      │
├────────────────────────────────┤
│ Volante  Validação  Avançado  Sobre │
└────────────────────────────────┘
```

Tablet e desktop (900 px ou mais): abas no topo e duas colunas, com o
formulário fixo à esquerda.

```
┌──────────────────────────────────────────────────────────────────┐
│ Volante+         Volante   Validação   Avançado   Sobre          │
├────────────────────────┬─────────────────────────────────────────┤
│ [Mega-Sena|+Milionária]│ 3 jogos gerados           [Copiar todos]│
│ Concurso 3.067 · 06/10 │ ┌───────────┐ ┌───────────┐ ┌──────────┐│
│ R$ 92 mi · acumulou    │ │Jogo 1  ⧉ ↗│ │Jogo 2  ⧉ ↗│ │Jogo 3 ⧉ ↗││
│ [Avulsos | Fechamento] │ │▦ volante  │ │▦ volante  │ │▦ volante ││
│ Quantos jogos [2|3|4]  │ │05 12 23 … │ │07 19 28 … │ │11 24 36 …││
│ Não muda a chance…     │ └───────────┘ └───────────┘ └──────────┘│
│ [   Gerar jogos   ]    │ ▸ Rateio do prêmio                      │
│ (coluna de ~380 px)    │ ▸ O histórico favorece alguma dezena?   │
└────────────────────────┴─────────────────────────────────────────┘
```

### Assinatura: o mini-volante

**O que é**: uma grade pequena, em SVG `aria-hidden`, com as marcas do jogo:

- 10 × 6 na Mega-Sena (01 a 60);
- 10 × 5 na +Milionária (01 a 50), com uma linha de 6 trevos;
- células de 12 px;
- marcas na cor da modalidade;
- as dezenas continuam ao lado, em texto, para leitor de tela e para copiar.

**Por que pertence a este produto**:

1. **O nome**: o app se chama Volante+.
2. **O uso**: o jogo gerado vai para um volante, seja o de papel ou a grade do
   app da Caixa. Ver o desenho no mesmo formato acelera a transcrição e evita
   erro.
3. **A tese**: mostra a ideia central do app. Jogos populares formam linhas,
   diagonais e desenhos no volante; os gerados aqui não formam. A explicação
   da popularidade deixa de ser só um parágrafo.

**Onde usar**: no cartão do jogo, no seletor do fechamento (com o desenho do
volante e os alvos de 44 px mantidos) e, depois, no ícone do app.

**Trevo**: ganha forma própria — um trevo em SVG com o número —, no lugar do
chip roxo. A forma, e não a cor, distingue trevo de dezena
(`color.md › Inclusive color`: "you can use text labels or glyph shapes to
identify objects or states").

### Movimento

Nenhum movimento decorativo. Um único: depois de gerar, a tela rola até os
jogos, instantaneamente se "Reduzir movimento" estiver ativo. Não haverá
animação de bolinhas caindo: seria a emoção de cassino que o app recusa.

### Crítica do plano

- **Daria para usar este plano em outro produto?** Não. O mini-volante só faz
  sentido para quem preenche um volante da Caixa e mostra a tese de
  popularidade deste app. A paleta é a atual com ajustes de papel e contraste,
  e não é nenhum dos três visuais genéricos; o modo escuro deixa de ser
  verde-ácido sobre preto.
- **Plataforma**: navegação e controles continuam componentes padrão do MUI
  (`BottomNavigation`, `Tabs`, `ToggleButtonGroup`, `TextField`). A identidade
  fica no volante, na tipografia dos números e no tom do texto
  (`branding.md › Best practices`: "Express your brand with familiar
  components.").
- **O que sai**: o prêmio como manchete, o selo vermelho, o alerta laranja na
  tela principal, a seta verde e o splash.
- **Piso de qualidade**: 320 px, foco visível, "Reduzir movimento" e texto a
  200% ficam cobertos pelos testes da Fase 0.

## 5. Plano de ação

Cada fase é um PR (ou dois, onde indicado), com teste, CHANGELOG e versão web no
mesmo PR, como pede a Constituição.

- **Versionamento**: as Fases 0 a 2 são correções (2.3.x). As Fases 3 a 5 mudam
  a interface (versão menor) e devem ser coordenadas com a 2.4.0 prevista na
  feature 002.
- **Tamanhos**: P = até meio dia; M = 1 a 2 dias; G = 3 a 5 dias.
- **Formato**: igual ao `tasks.md` do Spec Kit. `[P]` marca tarefas que podem
  rodar em paralelo.

> **Andamento (2026-10-07)**: Fases 0, 1 e 2 concluídas na versão web 2.3.1
> (D001–D017). As guardas da Fase 0 acharam um problema que esta revisão não
> tinha visto: as dezenas do fechamento tinham nome acessível diferente do
> texto visível (WCAG 2.5.3), corrigido na Fase 1. Ao trocar a formatação
> (D016) apareceu outro: o fator de Bayes entre 100 e 1000 saía como
> "1,2e+2". Para os campos (C1), a correção adotada foi o rótulo fixo acima
> do campo (`LabeledTextField`).

### Fase 0 — Guardas automáticas (1 PR, P)

Transformar as medições desta revisão em testes antes de corrigir, para que
nenhuma correção regrida.

- [x] D001 Adicionar `axe-core` como `devDependency` explícita em
  `web/package.json`. Hoje ele só existe como dependência transitiva do
  `eslint-plugin-jsx-a11y`.
- [x] D002 Criar `web/e2e/a11y.spec.ts`:
  - **O quê**: o axe com as tags `wcag2a`, `wcag2aa`, `wcag21aa` e `wcag22aa`
    nas quatro páginas e nos estados desta revisão (lote gerado nas duas
    modalidades, fechamento, backtest rodado, Análise avançada com as seções
    abertas), em claro e escuro.
  - **Exceções**: começa com uma lista que tem só as regras desta revisão
    (`heading-order`, `landmark-one-main`, `page-has-heading-one`, `region`,
    `landmark-unique` e `scrollable-region-focusable`). A Fase 1 esvazia a
    lista.
- [x] D003 No mesmo arquivo, testes com texto a 200% (`html { font-size: 200%
  }`) e em 320 × 640. Falham se houver:
  - texto cortado (elemento com `overflow` oculto e `scrollWidth >
    clientWidth`);
  - rótulo de campo cruzando o valor (caixas que se sobrepõem);
  - rolagem horizontal da página;
  - borda de campo abaixo de 3:1 (cor calculada da borda do `fieldset`).
- [x] D004 [P] No mesmo arquivo: falha se algum texto visível tiver número
  decimal com ponto (`/\d\.\d+\s?[%×]/`).
- [x] D005 Tornar o `a11y.spec.ts` bloqueante em `.github/workflows/web-ci.yml`.
  - Hoje o job de e2e roda com `continue-on-error: true` e depende do build.
  - O build do CI está falhando no upload de artefatos por cota esgotada (ver
    PR #16). Sem resolver isso, o e2e nem roda.

**Aceite**: o teste roda localmente e no CI, e hoje falha exatamente nos achados
C1, C2, C3 e A10.

### Fase 1 — Acessibilidade crítica (1 PR, P–M) — C1, C2, C3, A10

- [x] D006 `web/src/theme.ts`:
  - `MuiTypography.defaultProps.variantMapping` com `subtitle1` e `subtitle2`
    virando `'p'`.
  - Borda do `MuiOutlinedInput` em #7A807B (claro) e #8A918C (escuro).
  - `transform` do `MuiInputLabel` em rem, ou rótulo estático acima do campo.
    Validar pelo D003.
- [x] D007 Títulos:
  - Um H1 por página: em `app/sobre/page.tsx:16`, `component="h1"`.
  - Painéis com `component="h2"`: `EvidencePanel`, `PayoutSharePanel`,
    `NextDrawCard` e as seções de `analise-avancada`.
  - `component="p"` no prêmio (`NextDrawCard.tsx:103`) e no percentual
    (`PayoutSharePanel.tsx:52`).
  - `slotProps={{ heading: { component: 'div' } }}` no "Ver detalhes" do
    `EvidencePanel`.
- [x] D008 Marcos e navegação:
  - `app/sobre/page.tsx` com `Container component="main"`.
  - Em `components/BottomNav.tsx`, `Paper component="nav"
    aria-label="Seções do app"`.
  - Itens com `component={Link}` e `href`, com `aria-current="page"` no item
    atual.
- [x] D009 Texto a 200%:
  - `components/NextDrawCard.tsx:83` com `useFlexGap` e `flexWrap: 'wrap'`.
  - `components/NumberBall.tsx` com tamanho em rem e fonte proporcional.
  - Campos de `app/analise-avancada/page.tsx` em coluna única abaixo de `sm`.
- [x] D010 Em `app/analise-avancada/page.tsx`, `TableContainer` com
  `tabIndex={0}`, `role="region"` e `aria-labelledby` apontando para o título
  da seção.
- [x] D011 Esvaziar a lista de exceções do `a11y.spec.ts`.

**Aceite**:

- axe sem violações nos 18 estados;
- testes de 200% e de 320 px passando;
- um H1 por página e nenhum salto de nível nos títulos.

### Fase 2 — Verdade e estado (1 PR, M) — A1, A2, A3, A4, M1 e parte de M6

- [x] D012 Modalidade única:
  - `context/LotteryThemeContext.tsx` passa a guardar a modalidade
    selecionada, persistida em `localStorage` dentro de `try/catch`.
  - `app/page.tsx:67`, `app/backtesting/page.tsx:71` e
    `app/analise-avancada/page.tsx:57` leem dali.
  - Teste e2e: escolher +Milionária e percorrer as quatro abas; recarregar a
    página mantém a escolha.
- [x] D013 "Acumulou" verdadeiro:
  - `services/caixaApi.ts` lê `acumulou` (API de terceiros) e o campo
    equivalente da oficial (conferir o nome).
  - `NextDrawInfo` ganha `accumulated?: boolean`.
  - `NextDrawCard` mostra "Acumulou", neutro, só quando o valor for `true`;
    sem o campo, não mostra nada.
  - Teste com fixture de concurso não acumulado (por exemplo, o 3.048).
- [x] D014 [P] Conteúdo do método:
  - Reescrever `sobre.howBody` com a estratégia ativa.
  - Em Análise avançada, renomear `tier-weighted` para "Faixas de frequência
    (método anterior)".
  - Remover `backtesting.useForGeneration` e `handleUseForGeneration`
    (`app/backtesting/page.tsx`, linhas 138 a 147 e 278 a 280).
  - Teste: o texto de Sobre contém `UNPOPULAR_STRATEGY_LABEL`.
- [x] D015 [P] Um só fechamento:
  - Retirar a seção "Cobertura combinatória" de `app/analise-avancada/page.tsx`
    e pôr no lugar um link para Volante › Fechamento.
  - Remover `engine/wheelingSystems.ts` e o teste dele se ficarem sem uso
    (conferir com `grep`).
- [x] D016 [P] Formatação:
  - Criar `web/src/lib/format.ts`, tudo com `Intl` em pt-BR: porcentagem,
    decimal, inteiro, moeda e potência de 10 com sobrescrito.
  - Usar em `engine/payoutShare.ts:227`, `components/PayoutSharePanel.tsx`,
    `components/EvidencePanel.tsx`, `app/backtesting/page.tsx` e
    `app/analise-avancada/page.tsx`.
  - Plural de "apostas premiadas" pelo i18n (`_one` e `_other`).
- [x] D017 [P] Preço único: o custo padrão em Análise avançada vem de
  `SIMPLE_BET_PRICE_BRL`, até o `official-rules.json` (T009 da feature 002)
  assumir esse papel.

**Aceite**:

- testes e2e de navegação e de formato passando;
- nenhum texto do app descreve a estratégia por faixas como a atual.

### Fase 3 — Hierarquia, fluxo e vereditos (2 PRs, M–G) — A5, A6, A8, A9, M2, M3, M8, M9

- [ ] D018 `web/src/components/ClaimStatement.tsx`:
  - Afirmação e ressalva no mesmo estilo: corpo, mesma cor.
  - Abaixo de um limiar (sugestão: 1%), o texto diz "efeito desprezível" em
    vez do percentual.
  - Usar em `PayoutSharePanel` e `GameCard`.
  - É a base dos painéis da feature 002 (T037, T046, T053).
- [ ] D019 `web/src/components/VerdictCallout.tsx`:
  - Veredito neutro: fundo #EEF0EC ou #262A27, ícone que muda pela forma.
  - Nunca usa `severity` de sucesso ou de atenção para resultado estatístico.
  - Aplicar no `EvidencePanel`, nas seções de aleatoriedade e de estratégias
    de `analise-avancada` e no Backtesting, onde sai o `TrendingUpIcon` verde e
    entra "dentro do ruído", em texto.
  - É a base das telas T061 e T069 da feature 002.
- [ ] D020 Fechamento:
  - Prévia ao vivo abaixo do seletor (`fechamento.preview`): jogos, custo e
    chance, recalculados enquanto as dezenas são marcadas.
  - Resultado numa lista compacta (`components/ClosureList.tsx`), uma linha por
    jogo, com `tabular-nums`, e os botões "Copiar todos" e "Compartilhar
    todos".
  - Contrato num cartão neutro.
  - É a base de T053 e T054.
- [ ] D021 Backtesting:
  - Data de corte padrão que deixa os últimos 300 concursos para validação.
  - Erro no próprio campo (`error` e `helperText`), no formato dd/mm/aaaa.
  - `SegmentedControl` no lugar do `Slider`.
- [ ] D022 Tela principal: o campo "Apostas no concurso" sai do cartão de
  geração e vai para o painel de rateio, como ajuste. Fica compatível com a
  estimativa automática da US3.
- [ ] D023 Depois de gerar:
  - rolar até "Jogos gerados" (instantâneo com "Reduzir movimento");
  - foco no título da lista;
  - `aria-live="polite"` com "N jogos gerados".
- [ ] D024 Backtesting: gráfico de barras observado × esperado, em SVG próprio
  (sem dependência nova), com tabela equivalente para leitor de tela.
- [ ] D025 Decisão de conteúdo do dono da estatística: um veredito por pergunta
  em todas as telas (M9), registrado em `docs/refinamento-estatistico.md`. O
  `VerdictCallout` exibe esse veredito.

**Aceite**:

- nenhum veredito estatístico com `severity="success"` ou `"warning"` (teste
  por busca no código dos componentes de veredito);
- ressalva com o mesmo tamanho calculado da afirmação;
- o fechamento mostra o custo antes de gerar;
- "Copiar todos" copia N linhas.

### Fase 4 — Layout responsivo e navegação (1 PR, M) — A7, M7, B3

- [ ] D026 Navegação por largura (`components/BottomNav.tsx` e o novo
  `components/TopNav.tsx`):
  - abaixo de 900 px, a barra inferior atual;
  - a partir de 900 px, `AppBar` com `Tabs` como links, na mesma ordem e com
    os mesmos rótulos, sem barra inferior;
  - `app/layout.tsx` ajusta o `paddingBottom`.
- [ ] D027 `app/page.tsx`, a partir de 900 px: duas colunas, com o formulário
  fixo (sticky, cerca de 380 px) e os resultados ao lado. Largura máxima para
  segmentos e botão.
- [ ] D028 `components/StatList.tsx`: no celular, linhas empilhadas no lugar das
  tabelas de Análise avançada (poder, desvios de intervalo, estratégias), com
  cabeçalhos que dizem a unidade ("Concursos analisados: 40 · 100 · 500 ·
  1.000"). É a base de T061 e T069.
- [ ] D029 Uma largura de conteúdo para as quatro páginas.

**Aceite**:

- a 1440 px, nenhum elemento fixo na base da janela;
- segmentos com até 240 px de largura;
- a 390 px, nenhuma tabela mais larga que o cartão.

### Fase 5 — Sistema visual e assinatura (2 PRs, G) — craft, M5, M10, B5

- [ ] D030 `theme.ts`: os tokens da seção 4 — fundo diferente da superfície,
  conteúdo, contorno, preenchimento e texto por modalidade em claro e escuro, e
  atenção.
- [ ] D031 Escala tipográfica da seção 4 (corpo de 17 px; mínimo de 13 px fora
  da barra de abas) e `font-variant-numeric: tabular-nums` em todos os números.
- [ ] D032 `components/MiniVolante.tsx`: SVG `aria-hidden` com grade 10 × 6
  (Mega) ou 10 × 5 com linha de trevos (+Milionária), marcas na cor da
  modalidade. Entra no `GameCard`, ao lado das dezenas em texto.
- [ ] D033 `components/TrevoBadge.tsx`: trevo em forma de trevo (SVG) com o
  número, no lugar do `Chip` secundário, com o texto "Trevos 2 e 4".
- [ ] D034 `GameCard` versão 2: título "Jogo 1" com as ações na mesma linha,
  com cerca de 120 px de altura.
- [ ] D035 `NextDrawCard`:
  - prêmio em texto de corpo;
  - "Acumulou" neutro;
  - data curta;
  - a linha de status do histórico passa a ficar aqui.
- [ ] D036 Seletor do fechamento com o desenho do volante: a mesma grade do
  mini-volante, mantendo os alvos de 44 px.
- [ ] D037 Ícone do app e `TileColor` derivados do mini-volante e da cor padrão.

**Aceite**:

- nova rodada da `/apple-design` sem achado alto em craft;
- teste que confere o contraste dos tokens contra a tabela da seção 4.

### Fase 6 — Polimento (1 PR, P) — B1, B4 e testes manuais

- [ ] D038 Remover o splash (`components/SplashScreen.tsx` e `app/layout.tsx`),
  ou mantê-lo só até a hidratação.
- [ ] D039 Área segura:
  - `viewportFit: 'cover'` em `app/layout.tsx`;
  - `paddingBottom: env(safe-area-inset-bottom)` na barra;
  - conferir num iPhone com o app instalado.
- [ ] D040 Avaliar `html { font: -apple-system-body }`, que faz a escala em rem
  seguir o tamanho de texto do iPhone. Testar antes de adotar.
- [ ] D041 Rodada manual:
  - VoiceOver no Safari do iPhone;
  - TalkBack no Chrome do Android;
  - desktop só com teclado;
  - texto grande no iPhone.

### Ordem e dependências

```
Fase 0 → Fase 1 → Fase 2 → Fase 3 ─┐
                       └→ Fase 4 ──┴→ Fase 5 → Fase 6
```

- A Fase 0 vem antes de tudo: sem as guardas, cada correção pode quebrar outra.
- As Fases 1 e 2 são pequenas e corrigem o que está errado em produção.
  Recomendo publicá-las juntas como 2.3.1.
- As Fases 3 e 4 podem andar em paralelo, em arquivos diferentes, depois da
  Fase 2.
- A Fase 5 depende da aprovação da direção da seção 4 (ver a seção 7).

## 6. Relação com a feature 002

Os painéis novos da feature 002 devem ser construídos sobre os componentes
deste plano, para não nascerem com os mesmos problemas.

| Tarefa da 002 | Depende de | Por quê |
|---|---|---|
| T024 (garantia com trevos no Fechamento) | D020 | o contrato e a lista do fechamento mudam de forma |
| T037 (cartão do jogo e painel de rateio) | D018, D032, D034 | afirmação com ressalva no mesmo tamanho; mini-volante |
| T038 e T073 (Sobre e metodologia) | D014 | D014 corrige o texto agora; T073 escreve o texto das cinco famílias |
| T046 e T047 (painel de valor do concurso) | D016, D018, D022 | formatação; ressalva; campo de apostas no lugar certo |
| T053 e T054 (resumo do lote e contrato do fechamento) | D018, D020 | mesmo contrato e mesma lista |
| T061 (laboratório) | D019, D028 | veredito neutro; listas no celular |
| T069 (auditoria forense) | D019, D028 | idem |
| T071 (frases proibidas) | D004 | mesmo conjunto de testes de texto |

Nenhuma tarefa de motor da 002 (fases 1, 2 e 4 do plano dela) depende deste
plano. Só as de tela dependem.

## 7. Decisões pendentes

| Decisão | Recomendação |
|---|---|
| Retirar "Cobertura combinatória" de Análise avançada (A4) | Retirar; o modo Fechamento faz o mesmo com menos jogos |
| Retirar Kelly e "banca" (M6) | Retirar; a feature 002 traz o painel de valor do concurso |
| Nome da aba "Backtesting" (M4) | "Validação" |
| Mini-volante como assinatura (seção 4) | Aprovar antes da Fase 5 |
| Um veredito por pergunta (M9) | Decisão do dono da estatística, antes do D019 |
| `-apple-system-body` no iPhone (D040) | Decidir depois do teste em aparelho |

## 8. Como verificar

- **Automático**: `web/e2e/a11y.spec.ts` (Fase 0). Cobre axe em 18 estados,
  texto a 200%, 320 px, formato de números e contraste de bordas. Mais os
  testes unitários de `format.ts`, `caixaApi.ts` (`acumulou`) e dos componentes
  `ClaimStatement` e `VerdictCallout`.
- **Revisão**: rodar `/apple-design` de novo ao fim das Fases 3 e 5. A meta é
  chegar a "Boa" sem crítico depois da Fase 2, e a "Excelente" depois da Fase 5
  — nada acima de Médio, com ponto de vista.
- **Manual**: D041.
