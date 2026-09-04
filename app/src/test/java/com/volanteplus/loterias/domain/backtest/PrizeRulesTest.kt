package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PrizeRulesTest {

    @Test
    fun `mega-sena premia quadra quina e sena`() {
        assertFalse(PrizeRules.isPrize(Lottery.MEGA_SENA, numberHits = 3, trevoHits = 0))
        assertTrue(PrizeRules.isPrize(Lottery.MEGA_SENA, numberHits = 4, trevoHits = 0))
        assertTrue(PrizeRules.isPrize(Lottery.MEGA_SENA, numberHits = 6, trevoHits = 0))
    }

    /**
     * As 10 faixas oficiais, uma a uma. Este teste substitui uma versão
     * anterior que afirmava que 4+0, 3+1 e 2+1 não premiavam — o regulamento
     * diz "1 ou nenhum trevo" nas faixas 2, 4 e 6, e as faixas 8 e 10 pedem
     * exatamente 1 trevo.
     */
    @Test
    fun `milionaria premia exatamente as dez faixas oficiais`() {
        val premiadas = setOf(
            6 to 2, 6 to 1, 6 to 0,   // faixas 1 e 2
            5 to 2, 5 to 1, 5 to 0,   // faixas 3 e 4
            4 to 2, 4 to 1, 4 to 0,   // faixas 5 e 6
            3 to 2,                   // faixa 7
            3 to 1,                   // faixa 8
            2 to 2,                   // faixa 9
            2 to 1,                   // faixa 10
        )
        for (dezenas in 0..6) {
            for (trevos in 0..2) {
                val esperado = (dezenas to trevos) in premiadas
                assertEquals(
                    "$dezenas dezenas + $trevos trevos",
                    esperado,
                    PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, dezenas, trevos),
                )
            }
        }
    }

    /** Regressão do bug: estas três faixas eram tratadas como não premiadas. */
    @Test
    fun `faixas antes omitidas agora premiam`() {
        assertTrue(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 4, trevoHits = 0))
        assertTrue(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 3, trevoHits = 1))
        assertTrue(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 2, trevoHits = 1))
    }

    /** 2 dezenas sem trevo nenhum continua sendo derrota. */
    @Test
    fun `milionaria nao premia sem trevo nas faixas baixas`() {
        assertFalse(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 3, trevoHits = 0))
        assertFalse(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 2, trevoHits = 0))
        assertFalse(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 1, trevoHits = 2))
    }

    @Test
    fun `indice da faixa segue a ordem oficial`() {
        assertEquals(1, PrizeRules.tierIndex(Lottery.MAIS_MILIONARIA, 6, 2))
        assertEquals(2, PrizeRules.tierIndex(Lottery.MAIS_MILIONARIA, 6, 0))
        assertEquals(6, PrizeRules.tierIndex(Lottery.MAIS_MILIONARIA, 4, 0))
        assertEquals(10, PrizeRules.tierIndex(Lottery.MAIS_MILIONARIA, 2, 1))
        assertNull(PrizeRules.tierIndex(Lottery.MAIS_MILIONARIA, 2, 0))

        assertEquals(1, PrizeRules.tierIndex(Lottery.MEGA_SENA, 6, 0))
        assertEquals(3, PrizeRules.tierIndex(Lottery.MEGA_SENA, 4, 0))
        assertNull(PrizeRules.tierIndex(Lottery.MEGA_SENA, 3, 0))

        assertEquals(3, PrizeRules.tierCount(Lottery.MEGA_SENA))
        assertEquals(10, PrizeRules.tierCount(Lottery.MAIS_MILIONARIA))
    }

    /** isPrize e tierIndex não podem discordar. */
    @Test
    fun `indice existe exatamente quando ha premio`() {
        Lottery.values().forEach { lottery ->
            for (dezenas in 0..6) {
                for (trevos in 0..2) {
                    assertEquals(
                        "$lottery $dezenas+$trevos",
                        PrizeRules.isPrize(lottery, dezenas, trevos),
                        PrizeRules.tierIndex(lottery, dezenas, trevos) != null,
                    )
                }
            }
        }
    }
}
