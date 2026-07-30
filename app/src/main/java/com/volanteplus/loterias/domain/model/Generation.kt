package com.volanteplus.loterias.domain.model

/** Estratégias de geração de jogos. */
enum class GenerationStrategy(
    val displayName: String,
    val description: String,
    /** Estratégias com histórico só rodam sob o protocolo de backtesting. */
    val requiresHistory: Boolean = false,
) {
    /** RNG criptográfico. Zero viés, zero filtro. */
    RANDOM("Aleatório puro", "RNG criptográfico. Zero viés, zero filtro."),

    /** Espalha pares/ímpares matematicamente (3 de cada por jogo). */
    BALANCED("Equilibrado", "Espalha pares/ímpares matematicamente."),

    /** "Números quentes": a promessa clássica que o backtesting coloca à prova. */
    FREQUENCY(
        "Mais sorteadas",
        "Prioriza as dezenas mais frequentes da janela de treino — hipótese a refutar.",
        requiresHistory = true,
    ),

    /**
     * Usa o desempenho calculado por um backtest já executado (ver
     * [com.volanteplus.loterias.domain.backtest.BacktestAnalyzer] e
     * `PerformanceCache`): não exige histórico no momento da geração porque
     * ele já foi consumido ao rodar o backtest.
     */
    BACKTEST_DRIVEN(
        "Backtest-Driven",
        "Usa o desempenho de um backtest já executado para priorizar dezenas.",
    ),
}

/**
 * Jogo gerado: [numbers] sempre ordenado; [trevoDuplas] vazio para loterias
 * sem trevos, 1 dupla no modo Econômico ou as 15 duplas na Cobertura total.
 */
data class GeneratedGame(
    val numbers: List<Int>,
    val trevoDuplas: List<Set<Int>> = emptyList(),
)

data class GameBatch(
    val lottery: Lottery,
    val strategy: GenerationStrategy,
    val games: List<GeneratedGame>,
    /** Dezenas de origem no modo Fechamento; null quando o lote usa o volante inteiro. */
    val sourcePool: List<Int>? = null,
)
