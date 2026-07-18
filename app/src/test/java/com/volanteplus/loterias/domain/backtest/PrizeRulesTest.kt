package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrizeRulesTest {

    @Test
    fun `mega-sena premia quadra quina e sena`() {
        assertFalse(PrizeRules.isPrize(Lottery.MEGA_SENA, numberHits = 3, trevoHits = 0))
        assertTrue(PrizeRules.isPrize(Lottery.MEGA_SENA, numberHits = 4, trevoHits = 0))
        assertTrue(PrizeRules.isPrize(Lottery.MEGA_SENA, numberHits = 6, trevoHits = 0))
    }

    @Test
    fun `milionaria depende dos trevos nas faixas baixas`() {
        assertTrue(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 2, trevoHits = 2))
        assertFalse(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 2, trevoHits = 1))
        assertTrue(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 3, trevoHits = 2))
        assertFalse(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 3, trevoHits = 1))
        assertTrue(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 5, trevoHits = 0))
        assertFalse(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 4, trevoHits = 0))
        assertTrue(PrizeRules.isPrize(Lottery.MAIS_MILIONARIA, numberHits = 6, trevoHits = 0))
    }
}
