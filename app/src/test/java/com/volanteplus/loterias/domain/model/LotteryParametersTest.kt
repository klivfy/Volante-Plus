package com.volanteplus.loterias.domain.model

import com.volanteplus.loterias.domain.backtest.AccumulatedReturn
import com.volanteplus.loterias.domain.backtest.Hypergeometric
import com.volanteplus.loterias.domain.backtest.PrizeTable
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Regressão da parametrização por modalidade (feature 003-quina-lottery, Fase 1):
 * Mega-Sena e +Milionária continuam com 6 dezenas e R$ 6,00, e as fórmulas que
 * liam o 6 fixo dão os mesmos números. Valores de referência independentes:
 * C(60,6) = 50.063.860; C(50,6) = 15.890.700 e 15 duplas de trevos.
 */
class LotteryParametersTest {

    @Test
    fun `mega-sena e +milionaria seguem com 6 dezenas e preco de 6 reais`() {
        for (lottery in Lottery.values()) {
            assertEquals(6, lottery.numbersDrawn)
            assertEquals(6.0, PrizeTable.betPrice(lottery), 0.0)
        }
    }

    @Test
    fun `apostas simples distintas`() {
        assertEquals(50_063_860L, AccumulatedReturn.distinctSimpleBets(Lottery.MEGA_SENA))
        assertEquals(15_890_700L * 15, AccumulatedReturn.distinctSimpleBets(Lottery.MAIS_MILIONARIA))
    }

    @Test
    fun `media de acertos e K vezes n sobre N`() {
        assertEquals(0.6, Hypergeometric.meanFor(Lottery.MEGA_SENA), 1e-12)
        assertEquals(0.72, Hypergeometric.meanFor(Lottery.MAIS_MILIONARIA), 1e-12)
    }
}
