package com.volanteplus.loterias.domain.model

/** Faixa de desempenho de uma dezena na janela de treino do backtesting. */
enum class PerformanceTier {
    TOP,
    MID,
    LOW,
}

/**
 * Desempenho de uma dezena específica, derivado do BacktestAnalyzer:
 * [score] é a frequência normalizada (0..1) na janela analisada e [tier]
 * classifica a dezena em relação às demais da mesma loteria.
 */
data class NumberPerformance(
    val number: Int,
    val score: Double,
    val tier: PerformanceTier,
)
