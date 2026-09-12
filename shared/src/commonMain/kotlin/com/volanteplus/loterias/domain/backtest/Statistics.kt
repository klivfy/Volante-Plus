package com.volanteplus.loterias.domain.backtest

import kotlin.math.sqrt

/**
 * Estatísticas descritivas de uma amostra.
 *
 * Traz a variância **populacional** (descreve o conjunto observado) e a
 * **amostral** (estimador não viesado, base do erro padrão e dos intervalos
 * de confiança). A distinção importa: usar a populacional em inferência
 * subestima a incerteza.
 */
data class Statistics(
    val mean: Double,
    /** Variância populacional (divide por n) — descritiva. */
    val variance: Double,
    val stdDeviation: Double,
    /** Variância amostral (divide por n−1) — para inferência. */
    val sampleVariance: Double,
    val sampleStdDeviation: Double,
    /** Erro padrão da média: s/√n. */
    val standardError: Double,
    val count: Int,
) {
    companion object {
        val EMPTY = Statistics(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0)

        fun of(values: List<Int>): Statistics = ofDoubles(values.map(Int::toDouble))

        /**
         * As observações devem ser **independentes**. No backtesting isso
         * significa uma observação por concurso: os jogos de um mesmo lote
         * são disjuntos por construção e, portanto, correlacionados
         * negativamente — agregá-los como i.i.d. produz erro padrão inválido.
         */
        fun ofDoubles(values: List<Double>): Statistics {
            if (values.isEmpty()) return EMPTY
            val n = values.size
            val mean = values.average()
            val sumSq = values.sumOf { (it - mean) * (it - mean) }
            val variance = sumSq / n
            val sampleVariance = if (n < 2) 0.0 else sumSq / (n - 1)
            val sampleSd = sqrt(sampleVariance)
            return Statistics(
                mean = mean,
                variance = variance,
                stdDeviation = sqrt(variance),
                sampleVariance = sampleVariance,
                sampleStdDeviation = sampleSd,
                standardError = if (n < 2) 0.0 else sampleSd / sqrt(n.toDouble()),
                count = n,
            )
        }
    }
}
