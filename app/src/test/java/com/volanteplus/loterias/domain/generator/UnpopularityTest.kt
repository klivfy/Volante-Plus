package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.GenerationStrategy
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

    /**
     * O gerador com a estratégia deve produzir jogos consistentemente menos
     * populares que o aleatório puro — é a única coisa que ele promete.
     */
    @Test
    fun `estrategia gera jogos menos populares que o aleatorio puro`() {
        fun mediaDePenalidade(strategy: GenerationStrategy, semente: Long): Double {
            val generator = GameGenerator(Random(semente))
            return (1..40).map {
                val batch = generator.generate(Lottery.MEGA_SENA, strategy, gameCount = 1)
                Unpopularity.penalty(Lottery.MEGA_SENA, batch.games.single().numbers)
            }.average()
        }
        val impopular = mediaDePenalidade(GenerationStrategy.UNPOPULAR, 2026L)
        val aleatorio = mediaDePenalidade(GenerationStrategy.RANDOM, 2026L)
        assertTrue(
            "Impopular=$impopular deveria ser menor que aleatório=$aleatorio",
            impopular < aleatorio,
        )
    }

    /**
     * O ponto honesto da entrega: a estratégia continua produzindo jogos
     * válidos e distintos entre si — não colapsa num único jogo "ótimo",
     * o que recriaria a aglomeração que ela existe para evitar.
     */
    @Test
    fun `estrategia nao colapsa em um unico jogo`() {
        val generator = GameGenerator(Random(4242L))
        val jogos = (1..30).map {
            generator.generate(Lottery.MEGA_SENA, GenerationStrategy.UNPOPULAR, 1)
                .games.single().numbers
        }
        assertTrue("Jogos idênticos demais: ${jogos.toSet().size} distintos", jogos.toSet().size >= 25)
        jogos.forEach { jogo ->
            assertEquals(6, jogo.size)
            assertEquals(6, jogo.toSet().size)
            assertTrue(jogo.all { it in Lottery.MEGA_SENA.numberRange })
            assertEquals(jogo.sorted(), jogo)
        }
    }

    @Test
    fun `estrategia funciona na milionaria e respeita o universo`() {
        val generator = GameGenerator(Random(11L))
        val batch = generator.generate(Lottery.MAIS_MILIONARIA, GenerationStrategy.UNPOPULAR, 5)
        assertEquals(5, batch.games.size)
        batch.games.forEach { jogo ->
            assertEquals(6, jogo.numbers.size)
            assertTrue(jogo.numbers.all { it in Lottery.MAIS_MILIONARIA.numberRange })
            assertEquals(1, jogo.trevoDuplas.size)
        }
    }

    @Test
    fun `estrategia nao exige historico`() {
        assertTrue(!GenerationStrategy.UNPOPULAR.requiresHistory)
    }

    /** Nenhuma estratégia pode ser exibida sem a sua ressalva. */
    @Test
    fun `toda estrategia tem ressalva honesta preenchida`() {
        GenerationStrategy.values().forEach { strategy ->
            assertTrue(
                "Ressalva vazia em $strategy",
                strategy.honestNote.length > 30,
            )
        }
        assertTrue(
            GenerationStrategy.UNPOPULAR.honestNote.contains("não aumenta sua chance", ignoreCase = true),
        )
    }
}
