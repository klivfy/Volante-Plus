package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NumberPerformance
import com.volanteplus.loterias.domain.model.PerformanceTier

/**
 * Deriva o desempenho histórico de cada dezena de uma loteria a partir do
 * histórico de concursos, para alimentar a geração "Backtest-Driven"
 * ([com.volanteplus.loterias.domain.generator.GameGenerator.generateWithPerformances]).
 *
 * Sem histórico, não há o que diferenciar: todas as dezenas recebem o
 * mesmo peso (1 / quantidade de dezenas da loteria) e o tier médio (MID).
 * Com histórico, o score é a frequência normalizada pela dezena mais
 * sorteada e o terço superior/médio/inferior do ranking define o tier.
 */
class BacktestAnalyzer {

    fun analyze(lottery: Lottery, history: List<Draw>): List<NumberPerformance> {
        val range = lottery.numberRange.toList()
        if (history.isEmpty()) {
            val equalWeight = 1.0 / range.size
            return range.map { NumberPerformance(it, equalWeight, PerformanceTier.MID) }
        }

        val counts = history.flatMap { it.numbers }.groupingBy { it }.eachCount()
        val maxCount = counts.values.maxOrNull() ?: 0
        val ranked = range
            .map { number -> number to (counts[number] ?: 0) }
            .sortedWith(compareByDescending<Pair<Int, Int>> { it.second }.thenBy { it.first })

        val topCut = ceilDiv(ranked.size, TIER_COUNT)
        val midCut = ceilDiv(ranked.size * 2, TIER_COUNT)

        return ranked.mapIndexed { index, (number, count) ->
            val score = if (maxCount == 0) 0.0 else count.toDouble() / maxCount
            val tier = when {
                index < topCut -> PerformanceTier.TOP
                index < midCut -> PerformanceTier.MID
                else -> PerformanceTier.LOW
            }
            NumberPerformance(number, score, tier)
        }
    }

    private fun ceilDiv(a: Int, b: Int): Int = (a + b - 1) / b

    companion object {
        private const val TIER_COUNT = 3
    }
}
