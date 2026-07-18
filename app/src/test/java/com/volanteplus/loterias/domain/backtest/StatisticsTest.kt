package com.volanteplus.loterias.domain.backtest

import org.junit.Assert.assertEquals
import org.junit.Test

class StatisticsTest {

    @Test
    fun `media variancia e desvio padrao de amostra conhecida`() {
        // valores 0,1,2,3: média 1,5; variância populacional 1,25
        val stats = Statistics.of(listOf(0, 1, 2, 3))

        assertEquals(1.5, stats.mean, 1e-9)
        assertEquals(1.25, stats.variance, 1e-9)
        assertEquals(Math.sqrt(1.25), stats.stdDeviation, 1e-9)
    }

    @Test
    fun `amostra constante tem variancia zero`() {
        val stats = Statistics.of(listOf(2, 2, 2))
        assertEquals(2.0, stats.mean, 1e-9)
        assertEquals(0.0, stats.variance, 1e-9)
    }

    @Test
    fun `amostra vazia produz estatisticas zeradas`() {
        assertEquals(Statistics.EMPTY, Statistics.of(emptyList()))
    }
}
