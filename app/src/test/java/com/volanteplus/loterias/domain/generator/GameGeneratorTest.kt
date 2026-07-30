package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NumberPerformance
import com.volanteplus.loterias.domain.model.PerformanceTier
import com.volanteplus.loterias.domain.model.TrevoStrategy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.util.Random

class GameGeneratorTest {

    private fun generator(seed: Long = 42L) = GameGenerator(Random(seed))

    @Test
    fun `jogo tem 6 dezenas ordenadas dentro do intervalo`() {
        val batch = generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, GameGenerator.MIN_GAMES)
        val game = batch.games.first()

        assertEquals(6, game.numbers.size)
        assertEquals(game.numbers.sorted(), game.numbers)
        assertEquals(6, game.numbers.toSet().size)
        assertTrue(game.numbers.all { it in Lottery.MEGA_SENA.numberRange })
    }

    @Test
    fun `lote maximo na mega-sena e totalmente disjunto`() {
        val batch = generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, GameGenerator.MAX_GAMES)
        val all = batch.games.flatMap { it.numbers }

        assertEquals(GameGenerator.MAX_GAMES * 6, all.size)
        assertEquals(all.size, all.toSet().size)
    }

    @Test
    fun `milionaria mantem disjuncao no lote maximo`() {
        val batch = generator().generate(
            Lottery.MAIS_MILIONARIA, GenerationStrategy.RANDOM, GameGenerator.MAX_GAMES,
        )
        // MAX_GAMES * 6 = 30 < 50 dezenas: nenhuma repetição é necessária
        val all = batch.games.flatMap { it.numbers }
        assertEquals(GameGenerator.MAX_GAMES * 6, all.toSet().size)
        assertTrue(batch.games.all { it.numbers.toSet().size == 6 })
    }

    @Test
    fun `fechamento usa apenas as dezenas do pool`() {
        val pool = setOf(3, 7, 12, 19, 24, 33, 41, 55, 58, 60)
        val batch = generator().generate(
            Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 5, pool = pool,
        )

        assertEquals(pool.sorted(), batch.sourcePool)
        assertTrue(batch.games.all { pool.containsAll(it.numbers) })
        assertTrue(batch.games.all { it.numbers.toSet().size == 6 })
    }

    @Test
    fun `fechamento cobre todas as dezenas marcadas antes de repetir`() {
        val pool = setOf(1, 5, 10, 15, 20, 25, 30, 35, 40, 45)
        val batch = generator().generate(
            Lottery.MEGA_SENA, GenerationStrategy.BALANCED, 3, pool = pool,
        )
        // 2 jogos (12 vagas) já superam as 10 dezenas: cobertura total até o 2º
        val firstTwo = batch.games.take(2).flatMap { it.numbers }.toSet()
        assertEquals(pool, firstTwo)
    }

    @Test
    fun `fechamento rejeita pool invalido`() {
        assertThrows(IllegalArgumentException::class.java) {
            generator().generate(
                Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 2,
                pool = setOf(1, 2, 3, 4, 5),
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            generator().generate(
                Lottery.MAIS_MILIONARIA, GenerationStrategy.RANDOM, 2,
                pool = setOf(1, 2, 3, 4, 5, 51),
            )
        }
    }

    @Test
    fun `estrategia equilibrada gera 3 pares e 3 impares`() {
        val batch = generator().generate(Lottery.MEGA_SENA, GenerationStrategy.BALANCED, 5)

        batch.games.forEach { game ->
            assertEquals(3, game.numbers.count { it % 2 == 0 })
            assertEquals(3, game.numbers.count { it % 2 != 0 })
        }
    }

    @Test
    fun `mega-sena nao recebe trevos`() {
        val batch = generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 3)
        assertTrue(batch.games.all { it.trevoDuplas.isEmpty() })
    }

    @Test
    fun `modo economico gera exatamente 1 dupla de trevos valida`() {
        val batch = generator().generate(
            Lottery.MAIS_MILIONARIA, GenerationStrategy.RANDOM, 3, TrevoStrategy.ECONOMICO,
        )
        batch.games.forEach { game ->
            val dupla = game.trevoDuplas.single()
            assertEquals(2, dupla.size)
            assertTrue(dupla.all { it in Lottery.TREVO_RANGE })
        }
    }

    @Test
    fun `cobertura total gera as 15 duplas`() {
        val batch = generator().generate(
            Lottery.MAIS_MILIONARIA, GenerationStrategy.RANDOM, GameGenerator.MIN_GAMES, TrevoStrategy.COBERTURA_TOTAL,
        )
        val duplas = batch.games.first().trevoDuplas

        assertEquals(15, duplas.size)
        assertEquals(15, duplas.toSet().size)
        assertTrue(duplas.all { it.size == 2 })
    }

    @Test
    fun `mais sorteadas escolhe as dezenas mais frequentes da janela de treino`() {
        val hot = listOf(7, 14, 21, 28, 35, 42)
        val history = (1..5).map { contest ->
            Draw(Lottery.MEGA_SENA, contest, LocalDate.of(2024, 1, contest), hot)
        }

        val batch = generator().generate(
            Lottery.MEGA_SENA, GenerationStrategy.FREQUENCY, 2, history = history,
        )

        // 1º jogo: exatamente as 6 mais frequentes; 2º jogo: repetição mínima
        assertEquals(hot.sorted(), batch.games[0].numbers)
        assertTrue(batch.games[1].numbers.none(hot::contains))
    }

    @Test
    fun `mais sorteadas sem historico e rejeitada`() {
        assertThrows(IllegalArgumentException::class.java) {
            generator().generate(Lottery.MEGA_SENA, GenerationStrategy.FREQUENCY, 2)
        }
        assertThrows(IllegalArgumentException::class.java) {
            generator().generate(
                Lottery.MEGA_SENA, GenerationStrategy.FREQUENCY, 2, history = emptyList(),
            )
        }
    }

    @Test
    fun `mesma semente produz o mesmo lote`() {
        val first = generator(7L).generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 5)
        val second = generator(7L).generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 5)
        assertEquals(first.games.map { it.numbers }, second.games.map { it.numbers })
    }

    @Test
    fun `quantidade fora do limite e rejeitada`() {
        assertThrows(IllegalArgumentException::class.java) {
            generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, GameGenerator.MAX_GAMES + 1)
        }
    }

    /** Performances sintéticas: [topNumbers] no tier TOP, o resto no MID. */
    private fun performancesFor(lottery: Lottery, topNumbers: Set<Int>): List<NumberPerformance> =
        lottery.numberRange.map { number ->
            if (number in topNumbers) {
                NumberPerformance(number, score = 1.0, tier = PerformanceTier.TOP)
            } else {
                NumberPerformance(number, score = 0.2, tier = PerformanceTier.MID)
            }
        }

    @Test
    fun testGenerateWithPerformances_minGames() {
        val performances = performancesFor(Lottery.MEGA_SENA, topNumbers = (1..20).toSet())
        assertThrows(IllegalArgumentException::class.java) {
            generator().generateWithPerformances(Lottery.MEGA_SENA, performances, gameCount = 1)
        }
    }

    @Test
    fun testGenerateWithPerformances_maxGames() {
        val performances = performancesFor(Lottery.MEGA_SENA, topNumbers = (1..20).toSet())
        assertThrows(IllegalArgumentException::class.java) {
            generator().generateWithPerformances(Lottery.MEGA_SENA, performances, gameCount = 6)
        }
    }

    @Test
    fun testGenerateWithPerformances_validRange() {
        val performances = performancesFor(Lottery.MEGA_SENA, topNumbers = (1..20).toSet())
        for (count in GameGenerator.MIN_GAMES..GameGenerator.MAX_GAMES) {
            val batch = generator().generateWithPerformances(Lottery.MEGA_SENA, performances, gameCount = count)
            assertEquals(count, batch.games.size)
            assertTrue(batch.games.all { it.numbers.size == 6 && it.numbers.toSet().size == 6 })
        }
    }

    @Test
    fun testTierDistribution() {
        // 20 de 60 dezenas no tier TOP (um terço) — ratio-alvo de 70% por jogo.
        val topNumbers = (1..20).toSet()
        val performances = performancesFor(Lottery.MEGA_SENA, topNumbers)
        val batch = generator().generateWithPerformances(
            Lottery.MEGA_SENA, performances, gameCount = GameGenerator.MAX_GAMES,
        )

        val expectedTopPerGame = Math.round(6 * GameGenerator.TOP_TIER_TARGET_RATIO).toInt()
        batch.games.forEach { game ->
            val topCount = game.numbers.count { it in topNumbers }
            assertEquals(expectedTopPerGame, topCount)
        }

        val totalPicked = batch.games.sumOf { it.numbers.size }
        val totalTop = batch.games.sumOf { game -> game.numbers.count { it in topNumbers } }
        val ratio = totalTop.toDouble() / totalPicked
        assertTrue("esperado ~70% do tier TOP, obtido $ratio", ratio in 0.6..0.8)
    }
}
