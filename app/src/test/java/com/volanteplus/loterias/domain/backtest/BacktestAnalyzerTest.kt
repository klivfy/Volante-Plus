package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.PerformanceTier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class BacktestAnalyzerTest {

    private val analyzer = BacktestAnalyzer()

    @Test
    fun testAnalyze_withEmptyHistory_returnsEqualWeights() {
        val performances = analyzer.analyze(Lottery.MEGA_SENA, history = emptyList())

        assertEquals(Lottery.MEGA_SENA.numberRange.count(), performances.size)
        val distinctScores = performances.map { it.score }.distinct()
        assertEquals(1, distinctScores.size)
        assertTrue(performances.all { it.tier == PerformanceTier.MID })
    }

    @Test
    fun testAnalyze_withSyntheticData_ranksCorrectly() {
        // 7 aparece em todos os concursos; 60 nunca aparece.
        val history = (1..10).map { contest ->
            Draw(Lottery.MEGA_SENA, contest, LocalDate.of(2024, 1, contest), listOf(7, 8, 9, 10, 11, 12))
        }

        val performances = analyzer.analyze(Lottery.MEGA_SENA, history)
        val byNumber = performances.associateBy { it.number }

        assertEquals(1.0, byNumber.getValue(7).score, 0.0)
        assertEquals(PerformanceTier.TOP, byNumber.getValue(7).tier)
        assertEquals(0.0, byNumber.getValue(60).score, 0.0)
        assertEquals(PerformanceTier.LOW, byNumber.getValue(60).tier)
    }

    @Test
    fun testNumberPerformance_ordering() {
        val history = listOf(
            Draw(Lottery.MEGA_SENA, 1, LocalDate.of(2024, 1, 1), listOf(1, 2, 3, 4, 5, 6)),
            Draw(Lottery.MEGA_SENA, 2, LocalDate.of(2024, 1, 2), listOf(1, 2, 3, 7, 8, 9)),
        )

        val performances = analyzer.analyze(Lottery.MEGA_SENA, history)

        val scores = performances.map { it.score }
        assertEquals(scores.sortedDescending(), scores)
    }
}
