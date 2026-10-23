package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Regras da Quina (feature 003-quina-lottery). Oráculos independentes, de
 * `specs/003-quina-lottery/contracts/quina-official-rules.md`: combinatória
 * exata (C(80,5) = 24.040.016) e a tabela oficial da Caixa (±1).
 */
class QuinaRulesTest {

    private val total = 24_040_016.0

    @Test
    fun `parametros da quina`() {
        val q = Lottery.QUINA
        assertEquals(5, q.numbersDrawn)
        assertEquals(1..80, q.numberRange)
        assertEquals(5, q.minSelection)
        assertEquals(15, q.maxSelection)
        assertEquals(false, q.hasTrevos)
        assertEquals(3.0, PrizeTable.betPrice(q), 0.0)
    }

    @Test
    fun `chances exatas da aposta simples`() {
        val d = Hypergeometric.distributionFor(Lottery.QUINA)
        // Tolerância relativa: a implementação usa exp(ln C), não inteiros exatos.
        mapOf(5 to 1.0, 4 to 375.0, 3 to 27_750.0, 2 to 675_250.0).forEach { (acertos, combinacoes) ->
            val esperado = combinacoes / total
            assertEquals("$acertos acertos", esperado, d.getValue(acertos), esperado * 1e-8)
        }
        assertEquals(1.0, d.values.sum(), 1e-12)
    }

    @Test
    fun `media de acertos e K vezes n sobre N`() {
        assertEquals(25.0 / 80.0, Hypergeometric.meanFor(Lottery.QUINA), 1e-12)
    }

    @Test
    fun `de 2 a 5 acertos pagam, com indices 4 3 2 1`() {
        assertEquals(4, PrizeRules.tierCount(Lottery.QUINA))
        assertEquals(1, PrizeRules.tierIndex(Lottery.QUINA, 5, 0))
        assertEquals(2, PrizeRules.tierIndex(Lottery.QUINA, 4, 0))
        assertEquals(3, PrizeRules.tierIndex(Lottery.QUINA, 3, 0))
        assertEquals(4, PrizeRules.tierIndex(Lottery.QUINA, 2, 0))
        assertNull(PrizeRules.tierIndex(Lottery.QUINA, 1, 0))
        assertTrue((0..1).none { PrizeRules.isPrize(Lottery.QUINA, it, 0) })
        assertTrue((2..5).all { PrizeRules.isPrize(Lottery.QUINA, it, 0) })
    }

    @Test
    fun `retorno esperado da quina conserva o bolo e acumula 30 por cento`() {
        val er = PrizeTable.expectedReturn(Lottery.QUINA)
        assertEquals(4, er.tiers.size)
        assertEquals(ShareBase.GROSS_PRIZE, er.shareBase)
        assertEquals(3.0 * 0.4379, er.longRunReturn, 1e-12)
        // 35% + 15% + 10% + 10% do prêmio bruto; os 30% restantes acumulam.
        assertEquals(0.70, er.immediateShareOfPrize, 1e-9)
        assertTrue(er.immediateReturn <= er.longRunReturn)
        assertTrue(er.expectedLoss > 0.0)
        assertEquals(1.0 - 0.4379, er.houseEdge, 1e-12)
    }

    @Test
    fun `tabela oficial 1 em N por quantidade de dezenas, com tolerancia de 1`() {
        // [dezenas, quina, quadra, terno, duque]
        val oficial = listOf(
            doubleArrayOf(6.0, 4_006_669.0, 21_658.0, 445.0, 25.0),
            doubleArrayOf(10.0, 95_396.0, 1_635.0, 82.0, 9.0),
            doubleArrayOf(15.0, 8_005.0, 271.0, 25.0, 5.2),
        )
        for (linha in oficial) {
            val n = linha[0].toInt()
            listOf(5, 4, 3, 2).forEachIndexed { i, acertos ->
                val exato = 1.0 / hipergeometrica(80, 5, n, acertos)
                assertTrue("$n dezenas, $acertos acertos: $exato vs ${linha[i + 1]}", kotlin.math.abs(exato - linha[i + 1]) <= 1.0)
            }
        }
    }

    @Test
    fun `concurso da quina exige 5 dezenas distintas em 1 a 80 e nenhum trevo`() {
        val data = LocalDate.of(1994, 3, 13)
        Draw(Lottery.QUINA, 1, data, listOf(5, 20, 33, 61, 80)) // válido
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.QUINA, 1, data, listOf(1, 2, 3, 4, 5, 6))
        }
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.QUINA, 1, data, listOf(5, 20, 33, 61, 81))
        }
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.QUINA, 1, data, listOf(5, 20, 33, 61, 80), trevos = listOf(1, 2))
        }
    }

    /** C(K,k)·C(N−K,n−k)/C(N,n), independente do código sob teste. */
    private fun hipergeometrica(bigN: Int, bigK: Int, n: Int, k: Int): Double =
        comb(bigK, k) * comb(bigN - bigK, n - k) / comb(bigN, n)

    private fun comb(n: Int, k: Int): Double {
        if (k < 0 || k > n) return 0.0
        var r = 1.0
        for (i in 1..k) r = r * (n - k + i) / i
        return r
    }
}
