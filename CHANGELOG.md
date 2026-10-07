# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

## [Unreleased]

## [2.3.1] - 2026-10-07

Laboratório web (`web/`): Fases 0 a 2 da revisão de design
(`docs/revisao-de-design-2026-10.md`). Não altera app Android, desktop nem
extensão.

### Added
- Guardas de acessibilidade (`web/e2e/a11y.spec.ts`), com job próprio e
  bloqueante no CI: axe-core (WCAG 2.2 AA) nas quatro telas, em claro e
  escuro; texto a 200% e tela de 320 px; contorno dos campos com pelo menos
  3:1; nenhum decimal com ponto. As APIs externas são simuladas, sem rede.
- `web/src/lib/format.ts`: toda formatação de número visível em pt-BR.

### Fixed
- Texto a 200%: o cartão do próximo concurso cortava o selo e a data; o
  rótulo dos campos ficava por cima do valor ou saía cortado (os campos agora
  têm rótulo fixo acima); bolinhas e chips crescem com o texto.
- Leitor de tela: títulos falsos (prêmio como H6, percentual como H4, "Ver
  detalhes" como H3) e Sobre sem `<main>` nem H1; a barra inferior vira
  `<nav>` com links e marca a página atual; as dezenas do fechamento têm o
  nome acessível igual ao texto visível.
- Teclado: as tabelas roláveis da Análise avançada recebem foco.
- Contorno dos campos: 3,94:1 no claro e 5,31:1 no escuro (era 1,74:1 e
  2,11:1).
- A modalidade escolhida vale em todas as abas e persiste; antes a cor dizia
  +Milionária e o seletor, Mega-Sena.
- O selo "Acumulou" vem da API; antes aparecia em todo concurso, mesmo depois
  de um com ganhador.
- Números em pt-BR em todas as telas ("15,6%", não "15.6%"); o fator de Bayes
  entre 100 e 1000 saía como "1,2e+2".

### Changed
- A página Sobre e a comparação de estratégias descrevem o método de geração
  atual (baixa popularidade), não mais as faixas 70/20/10 como se fossem o
  padrão.
- Sai o botão "Usar estes dados para gerar jogos" do Backtesting: a
  estratégia padrão não usa esses dados.
- Sai a cobertura combinatória da Análise avançada (e `wheelingSystems.ts`):
  dava 23 jogos onde o modo Fechamento dá 20, verificados. Fica um caminho até
  o Fechamento.
- Custo padrão do bilhete na Análise avançada: R$ 6, o mesmo do fechamento.

## [2.3.0] - 2026-10-06

Laboratório web (`web/`): consolida segurança, precisão das sugestões, métodos
estatísticos adicionais, histórico completo e a revisão de design. Não altera
app Android, desktop nem extensão.

### Added
- Fechamento por cobertura combinatória (`web/src/engine/closureDesigner.ts`):
  o modo Fechamento agora existe na tela principal, com seletor de dezenas e
  contrato explícito ("N jogos · R$ X — se t ou mais das suas dezenas saírem,
  algum jogo acerta t ou mais"). A garantia é construída por set cover guloso
  com reinícios e poda, e provada por verificação exaustiva (`verifyClosure`)
  para todos os pools de 7 a 15 dezenas. C(10,6,4) sai com 20 jogos, a melhor
  cota conhecida. Só se oferecem garantias que podem pagar prêmio na modalidade.
- Evidência estatística sobre a frequência das dezenas
  (`web/src/engine/numberEvidence.ts`, `EvidencePanel`): teste bilateral por
  dezena com Bonferroni, qui-quadrado global, poder e viés mínimo detectável,
  e veredito (`COMPATIVEL_COM_ACASO`, `DESVIO_SIGNIFICATIVO`,
  `AMOSTRA_INSUFICIENTE`). Calibrado por simulação: falso-positivo global de
  5,8% em 400 históricos honestos.

- Métodos estatísticos adicionais (ver `docs/metodos-estatisticos-adicionais.md`):
  fator de Bayes omnibus e esparso com p-valor sempre válido e encolhimento por
  Bayes empírico (`bayesEvidence.ts`); testes de colisão e de espectro de
  sobreposição entre concursos (`drawDependence.ts`); chance de a garantia do
  fechamento valer e chance acumulada (`betPlanning.ts`).
- Fechamentos por recozimento simulado (`closureTables.ts`,
  `web/scripts/covering-search.mjs`): C(12,6,4) cai de 51 para 41 jogos (ótimo
  provado), C(11,6,4) de 36 para 32, C(14,6,4) de 107 para 80, com verificação
  exaustiva e o guloso como reserva.

- Histórico real completo e sempre atualizado (ver `docs/historico.md`): seed
  embutido com Mega-Sena 1..3063 e +Milionária 1..393 (até 27/09/2026), validado
  e conferido contra um espelho independente; sincronização dirigida pelo que
  falta (`historySync.ts`), com fontes em cascata, validação estrutural,
  preenchimento de lacunas, verificação ao abrir/voltar à aba/a cada 30 min, e
  painel com o intervalo, a data do último concurso e o estado de completude.
- Os testes de evidência (frequentista e bayesiano), a colisão e o painel passam
  a cobrir também os trevos da +Milionária; `modalityParity.test.ts` roda todos
  os métodos nas duas modalidades.

### Fixed
- Acessibilidade e modo escuro, a partir de uma revisão de design da tela principal:
  - **Modo escuro na primeira carga** deixava os cartões claros com texto branco
    (contraste 1,02:1). O tema agora troca claro/escuro por variáveis CSS
    (`prefers-color-scheme`), sem trocar em JavaScript depois da hidratação.
  - **Texto em `rem`**: com `px` o texto ignorava a preferência de tamanho do
    sistema. Os rótulos da barra inferior têm tamanho fixo de propósito.
  - **Contraste das cores das modalidades** (verde da Mega-Sena 3,07:1 com branco;
    azul da +Milionária 2,53:1 no escuro): todos os pares passam em 4,5:1.
  - **Alvos de toque de 44 pt** (chips 32, segmentado 36, dezenas do fechamento
    29×36 com 4 pt de folga, polegar do slider 20); o slider de 3 valores virou
    controle segmentado; foco do teclado com contorno de 2 px.
  - Painel de evidência com "Ver detalhes" e plural correto; avisos de status
    deixam de empurrar a tarefa principal; um só estilo de seletor; splash de
    0,7 s (era 2,5 s) e desligado com "Reduzir movimento"; fonte do sistema no
    lugar do `@import` do Google Fonts.
- O seed offline era sintético (PRNG): sem rede o app analisava sorteios
  inventados. Agora é o histórico real; a fixture sintética ficou só para a
  guarda de auditoria, e os concursos sintéticos são removidos do banco dos
  usuários que os receberam.
- O cache de desempenho `auto` nunca era invalidado: a análise ficava presa ao
  histórico de quando foi gerada. Agora é recalculado quando o histórico avança.
- O "próximo concurso" exibia o número do último sorteado (a API traz o do
  próximo em `proximoConcurso`).

### Changed
- O painel de evidência deixa de afirmar "não" quando o histórico é curto demais
  para detectar viés moderado: passa a dizer que falta dado.
- A estratégia de sorteio padrão passa a ser `UNPOPULAR`: cada jogo é o menos
  popular entre 64 candidatos uniformes. Não altera a chance de ganhar; reduz a
  divisão do prêmio (pelo modelo do app, cerca de +12% no valor condicional a
  ganhar com 30 milhões de apostas, para o percentil 5 de popularidade). Os
  trevos passam a ser sorteados uniformemente. A estratégia por tiers de
  frequência continua disponível (`strategy: 'FREQUENCY_TIERS'`) e é a usada
  pelo backtest e pelo benchmark, que existem para medi-la.

## [2.2.0]

Laboratório estatístico de loterias (`web/`) — nenhuma mudança de código
Android ou desktop neste lançamento.

### Added
- Rateio de prêmio (`web/src/engine/unpopularity.ts`, `payoutShare.ts`):
  porta do modelo de aglomeração/popularidade do Android, exposta na tela
  principal via `PayoutSharePanel` e por jogo em `GameCard`, condicionada ao
  usuário informar o número de apostas do concurso.
- Auditoria de anomalias pré-registrada — Módulo A (`web/src/engine/audit/`):
  A1 (uniformidade de dezenas/trevos), A2 (independência entre concursos),
  A3 (distribuição da soma), A4 (ganhadores vs. Poisson, com limitação
  declarada), A5 (replicação nas duas metades do histórico); linha de base
  simulada, correção de Bonferroni sobre o total de testes executados,
  efeito mínimo detectável a 80% de poder. Guarda de procedência
  (`provenance.ts`) recusa dado sintético ou não identificado.
- Primeira execução real do Módulo A sobre um espelho de terceiros dos
  resultados da Caixa (`data/mirrorSnapshot/`, 2.797 concursos da Mega-Sena
  e 199 da +Milionária) — nenhuma anomalia confirmada em nenhuma das duas
  modalidades.
- Método de previsibilidade pré-registrado — Módulo B (`moduleB.ts`):
  separa cronologicamente 20% do histórico para confirmação, escolhe
  estratégia candidata por benchmark com Bonferroni entre 5 estratégias, e
  só aprova alegação preditiva se a vantagem replicar em >=80% dos cortes
  walk-forward de confirmação. Sugestão de jogos — Módulo C (`moduleC.ts`):
  orçamento redefinido em quantidade de jogos (sem valor em reais nunca
  informado); usa a estratégia aprovada pelo Módulo B ou, no caso esperado
  de nenhuma aprovação, o motor padrão com aviso explícito de equivalência
  ao sorteio aleatório. Rodados sobre o mesmo espelho real: nenhuma
  estratégia aprovada em nenhuma das duas modalidades.
- `netlify.toml` (raiz do monorepo) e `web/.nvmrc`: segundo caminho de
  deploy além da Vercel, via `@netlify/plugin-nextjs`; botão "Deploy to
  Netlify" no README; seção correspondente em `docs/WEB.md`.

### Changed
- `retention-days` reduzido em todos os artefatos de CI (Android, desktop,
  web) para conter o acúmulo que esgotou a cota de armazenamento do
  GitHub Actions da conta.

## [2.1.0]

Lançamento da plataforma desktop Windows (`desktop/`) — o app passa a rodar
como Android, web e agora também um nativo Windows. Nenhuma mudança de
código Android ou web neste lançamento.

### Added
- Módulo Kotlin Multiplatform `shared/`: domínio (backtesting, geração de
  jogos, modelos) extraído de `app/` — já era Kotlin puro, sem mudança de
  comportamento. `app/` passa a depender de `:shared` em vez de conter esse
  código diretamente.
- App desktop para Windows (`desktop/`, Compose Multiplatform): telas de
  Volante e Backtesting adaptadas das equivalentes Android, atalhos de
  teclado (Ctrl+G gera jogos, Ctrl+B vai para Backtesting, F11 tela cheia),
  importação de histórico via CSV (sem persistência própria ainda — ver
  `docs/DESKTOP.md`).
- Desktop: bandeja do sistema (Abrir/Ver próximo concurso/Sair) com
  notificação nativa quando um novo concurso é detectado, verificação
  periódica em background e busca do próximo concurso (`GetNextDrawInfoUseCase`
  movido de `app/` para `:shared`, junto com `CaixaLotteryApi` — também
  Kotlin/JVM puro).
- Desktop: preferências (`java.util.prefs`) para última loteria, tema e
  tamanho da janela; tema sincronizado com o do Windows (detecção via
  registro) com botão de alternância manual; janela redimensionável com
  mínimo 600×400; tooltips nos botões principais.
- `.github/workflows/desktop-ci.yml`: compila e empacota `.msi`/`.exe` de
  verdade num runner `windows-latest` (empacotamento nativo não permite
  cross-compilation a partir de Linux/macOS), com assinatura Authenticode
  opcional via `signtool` quando o repositório tiver certificado configurado.
  Em tags `v*-desktop`, também publica os instaladores como Release draft
  do GitHub.
- `docs/WINDOWS.md`: processo de build, assinatura e submissão à Microsoft
  Store (MSIX), checklist de atualização de versão e troubleshooting.

## [2.0.0]

Lançamento da plataforma web (`web/`) — o app deixa de ser só Android.
Nenhuma mudança de código no app Android neste lançamento.

### Added
- Volante+ Web (Next.js 16, TypeScript, MUI/Material Design 3): páginas de
  Volante, Backtesting e Sobre, com o mesmo motor de análise/geração do
  Android reescrito em TypeScript puro (`web/src/engine/`).
- Persistência local via Dexie/IndexedDB (`web/src/services/db.ts`) e busca
  do próximo concurso via API pública de terceiros (`web/src/services/caixaApi.ts`).
- PWA: manifest, service worker (`@ducanh2912/next-pwa`), cache offline
  (cache-first para assets estáticos, network-first para a API da Caixa,
  stale-while-revalidate para imagens) — ver `docs/PWA.md`.
- Extensão de navegador (Chrome, Edge, Firefox) em `extension/`: popup que
  abre a instância configurada do Volante+ web numa aba — ver `docs/EXTENSOES.md`.
- Testes end-to-end (Playwright) cobrindo o fluxo completo de geração de
  jogos e o funcionamento offline.
- CI da web (`.github/workflows/web-ci.yml`): lint, testes, build, e2e,
  empacotamento das extensões e deploy opcional na Vercel.
- `docs/WEB.md`, `docs/PWA.md`, `docs/EXTENSOES.md`.

## [1.1.0]

### Added
- `NextDrawDto`, `NextDrawInfo` e `GetNextDrawInfoUseCase`: data e prêmio
  estimado do próximo concurso, com fallback gracioso (`null`) quando a API
  falha ou o dado ainda não está disponível.
- `NumberPerformance`/`PerformanceTier` e `BacktestAnalyzer`: derivam o
  desempenho histórico de cada dezena a partir da janela de treino de um
  backtest.
- `GameGenerator.generateWithPerformances`: geração de jogos baseada em
  tiers de desempenho ("Backtest-Driven"), priorizando ~70% das dezenas do
  tier `TOP` por jogo.
- `GenerationStrategy.BACKTEST_DRIVEN`: nova estratégia selecionável na
  tela de Volante quando há dados de um backtest no `PerformanceCache`.
- `PerformanceCache` (`ui/navigation/NavGraph.kt`): cache em memória que
  leva o resultado de um backtest da tela de Backtesting para a tela de
  Volante.
- Botão "Usar estes dados para gerar jogos" na tela de Backtesting,
  navegando para a tela de Volante com os dados já carregados no cache.

### Changed
- `GameGenerator.MAX_GAMES`: 10 → 5.
- `GameGenerator.MIN_GAMES`: novo, valor 2 (antes o mínimo implícito era 1).
- Defaults e chips de quantidade de jogos nas telas de Volante e
  Backtesting ajustados para o novo intervalo (2..5).

### Removed
- Opção de lote de 10 jogos nas telas de Volante e Backtesting (teto
  agora é 5).
