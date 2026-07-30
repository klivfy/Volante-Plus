# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

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
