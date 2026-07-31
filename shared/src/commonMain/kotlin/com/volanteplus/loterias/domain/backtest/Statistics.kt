package com.volanteplus.loterias.domain.backtest

import kotlin.math.sqrt

/** Estatísticas descritivas de uma amostra de acertos. */
data class Statistics(
    val mean: Double,
    val variance: Double,
    val stdDeviation: Double,
) {
    companion object {
        val EMPTY = Statistics(0.0, 0.0, 0.0)

        /** Variância populacional (o backtest observa todos os jogos gerados, não uma amostra). */
        fun of(values: List<Int>): Statistics {
            if (values.isEmpty()) return EMPTY
            val mean = values.average()
            val variance = values.sumOf { (it - mean) * (it - mean) } / values.size
            return Statistics(mean = mean, variance = variance, stdDeviation = sqrt(variance))
        }
    }
}
