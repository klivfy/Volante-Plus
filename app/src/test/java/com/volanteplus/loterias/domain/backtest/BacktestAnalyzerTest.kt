package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.util.Random

class BacktestAnalyzerTest {

    private fun analyzer(seed: Long = 42L) = BacktestAnalyzer(Random(seed))

    private fun config(lottery: Lottery = Lottery.MEGA_SENA) =
        BacktestConfig(lottery = lottery, cutoff = LocalDate.of(2024, 6, 30))

    /** 10 concursos com as mesmas dezenas quentes; 7..12 saem sempre. */
    private fun quentes(): List<Draw> = (1..10).map { contest ->
        Draw(Lottery.MEGA_SENA, contest, LocalDate.of(2024, 1, contest), listOf(7, 8, 9, 10, 11, 12))
    }

    @Test
    fun `historico vazio devolve pesos iguais e tier medio`() = runTest {
        val performances = analyzer().analyze(emptyList(), config())

        assertEquals(Lottery.MEGA_SENA.numberRange.count(), performances.size)
        assertEquals(1, performances.map { it.weight }.distinct().size)
        assertTrue(performances.all { it.tier == PerformanceTier.MID })
        assertTrue(performances.all { it.hitCount == 0 })
    }

    @Test
    fun `hitCount conta as aparicoes reais`() = runTest {
        val performances = analyzer().analyze(quentes(), config()).associateBy { it.number }

        assertEquals(10, performances.getValue(7).hitCount)
        assertEquals(10, performances.getValue(12).hitCount)
        assertEquals(0, performances.getValue(60).hitCount)
    }

    @Test
    fun `dezena sempre sorteada lidera o ranking`() = runTest {
        val performances = analyzer().analyze(quentes(), config())
        val byNumber = performances.associateBy { it.number }

        // A melhor da janela é normalizada em 1,0 e está entre as quentes.
        assertEquals(1.0, performances.first().weight, 1e-9)
        assertTrue(performances.first().number in 7..12)
        assertEquals(PerformanceTier.TOP, byNumber.getValue(7).tier)
        assertTrue(byNumber.getValue(7).weight > byNumber.getValue(60).weight)
    }

    @Test
    fun `resultado vem ordenado por peso decrescente`() = runTest {
        val weights = analyzer().analyze(quentes(), config()).map { it.weight }
        assertEquals(weights.sortedDescending(), weights)
        assertTrue(weights.all { it in 0.0..1.0 })
    }

    @Test
    fun `tiers seguem os percentis 40-30-30`() = runTest {
        val performances = analyzer().analyze(quentes(), config())
        val porTier = performances.groupingBy { it.tier }.eachCount()

        assertEquals(24, porTier.getValue(PerformanceTier.TOP)) // 40% de 60
        assertEquals(18, porTier.getValue(PerformanceTier.MID)) // 30% de 60
        assertEquals(18, porTier.getValue(PerformanceTier.LOW)) // 30% de 60
    }

    @Test
    fun `taxa simulada fica entre 0 e 1 e distingue quentes de frias`() = runTest {
        val performances = analyzer().analyze(quentes(), config()).associateBy { it.number }

        assertTrue(performances.values.all { it.simulatedHitRate in 0.0..1.0 })
        assertTrue(
            performances.getValue(7).simulatedHitRate > performances.getValue(60).simulatedHitRate
        )
    }

    @Test
    fun `mesma semente reproduz a mesma analise`() = runTest {
        val history = quentes()
        assertEquals(
            analyzer(7L).analyze(history, config()),
            analyzer(7L).analyze(history, config()),
        )
    }

    @Test
    fun `trevos sao analisados apenas na milionaria`() = runTest {
        assertTrue(analyzer().analyzeTrevos(quentes(), config()).isEmpty())

        val milionaria = (1..8).map { contest ->
            Draw(
                lottery = Lottery.MAIS_MILIONARIA,
                contestNumber = contest,
                date = LocalDate.of(2024, 1, contest),
                numbers = listOf(1, 2, 3, 4, 5, 6),
                trevos = listOf(1, 2),
            )
        }
        val trevos = analyzer()
            .analyzeTrevos(milionaria, config(Lottery.MAIS_MILIONARIA))
            .associateBy { it.number }

        assertEquals(Lottery.TREVO_RANGE.count(), trevos.size)
        assertEquals(8, trevos.getValue(1).hitCount)
        assertEquals(0, trevos.getValue(6).hitCount)
        assertTrue(trevos.getValue(1).weight > trevos.getValue(6).weight)
    }

    @Test
    fun `sem rodadas de simulacao o peso vem so da frequencia`() = runTest {
        val performances = analyzer()
            .analyze(quentes(), config().copy(simulationRounds = 0))
            .associateBy { it.number }

        assertTrue(performances.values.all { it.simulatedHitRate == 0.0 })
        assertEquals(1.0, performances.getValue(7).weight, 1e-9)
        assertEquals(0.0, performances.getValue(60).weight, 1e-9)
        assertEquals(PerformanceTier.LOW, performances.getValue(60).tier)
    }
}
