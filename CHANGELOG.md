# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

## [Unreleased]

### Added
- Módulo Kotlin Multiplatform `shared/`: domínio (backtesting, geração de
  jogos, modelos) extraído de `app/` — já era Kotlin puro, sem mudança de
  comportamento. `app/` passa a depender de `:shared` em vez de conter esse
  código diretamente.
- App desktop para Windows (`desktop/`, Compose Multiplatform): telas de
  Volante e Backtesting adaptadas das equivalentes Android, atalhos de
  teclado (Ctrl+G gera jogos, Ctrl+B vai para Backtesting), importação de
  histórico via CSV (sem persistência própria ainda — ver `docs/DESKTOP.md`).
- `.github/workflows/desktop-ci.yml`: compila e empacota `.msi`/`.exe` de
  verdade num runner `windows-latest` (empacotamento nativo não permite
  cross-compilation a partir de Linux/macOS).

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
