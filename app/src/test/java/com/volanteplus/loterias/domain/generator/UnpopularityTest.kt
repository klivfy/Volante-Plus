package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class UnpopularityTest {

    @Test
    fun `jogo de aniversarios e mais popular que jogo de dezenas altas`() {
        val aniversario = listOf(3, 7, 12, 19, 25, 31)
        val altas = listOf(34, 39, 46, 52, 57, 60)
        assertTrue(
            Unpopularity.penalty(Lottery.MEGA_SENA, aniversario) >
                Unpopularity.penalty(Lottery.MEGA_SENA, altas),
        )
    }

    @Test
    fun `sequencia consecutiva e mais popular que dezenas espalhadas`() {
        val consecutiva = listOf(40, 41, 42, 43, 44, 45)
        val espalhada = listOf(40, 43, 47, 51, 56, 60)
        assertTrue(
            Unpopularity.penalty(Lottery.MEGA_SENA, consecutiva) >
                Unpopularity.penalty(Lottery.MEGA_SENA, espalhada),
        )
    }

    @Test
    fun `coluna inteira do volante e mais popular que dezenas dispersas`() {
        // mesma coluna do volante impresso: 4, 14, 24, 34, 44, 54
        val coluna = listOf(4, 14, 24, 34, 44, 54)
        val dispersa = listOf(4, 16, 27, 38, 49, 58)
        assertTrue(
            Unpopularity.penalty(Lottery.MEGA_SENA, coluna) >
                Unpopularity.penalty(Lottery.MEGA_SENA, dispersa),
        )
    }

    @Test
    fun `progressao aritmetica e penalizada`() {
        val progressao = listOf(6, 12, 18, 24, 30, 36)
        val quebrada = listOf(6, 12, 18, 24, 30, 37)
        assertTrue(
            Unpopularity.penalty(Lottery.MEGA_SENA, progressao) >
                Unpopularity.penalty(Lottery.MEGA_SENA, quebrada),
        )
    }

    @Test
    fun `penalidade nunca e negativa e jogo vazio vale zero`() {
        assertEquals(0.0, Unpopularity.penalty(Lottery.MEGA_SENA, emptyList()), 1e-12)
        val rng = Random(99)
        repeat(500) {
            val jogo = (1..60).toMutableList()
                .also { java.util.Collections.shuffle(it, rng) }
                .take(6)
            assertTrue(Unpopularity.penalty(Lottery.MEGA_SENA, jogo) >= 0.0)
        }
    }

    @Test
    fun `primalidade esta correta no universo das loterias`() {
        val primos = (1..60).filter(Unpopularity::isPrime)
        assertEquals(
            listOf(2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59),
            primos,
        )
    }
}
