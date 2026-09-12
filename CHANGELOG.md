# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

## [Unreleased]

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
