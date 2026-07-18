package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class GameGeneratorTest {

    private fun generator(seed: Long = 42L) = GameGenerator(Random(seed))

    @Test
    fun `jogo tem 6 dezenas ordenadas dentro do intervalo`() {
        val batch = generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 1)
        val game = batch.games.single()

        assertEquals(6, game.numbers.size)
        assertEquals(game.numbers.sorted(), game.numbers)
        assertEquals(6, game.numbers.toSet().size)
        assertTrue(game.numbers.all { it in Lottery.MEGA_SENA.numberRange })
    }

    @Test
    fun `lote de 10 na mega-sena e totalmente disjunto e cobre as 60 dezenas`() {
        val batch = generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 10)
        val all = batch.games.flatMap { it.numbers }

        assertEquals(60, all.size)
        assertEquals(Lottery.MEGA_SENA.numberRange.toSet(), all.toSet())
    }

    @Test
    fun `milionaria mantem disjuncao ate esgotar o intervalo`() {
        val batch = generator().generate(
            Lottery.MAIS_MILIONARIA, GenerationStrategy.RANDOM, 10,
        )
        // 8 jogos * 6 = 48 de 50 dezenas: os 8 primeiros não podem repetir
        val firstEight = batch.games.take(8).flatMap { it.numbers }
        assertEquals(48, firstEight.toSet().size)
        assertTrue(batch.games.all { it.numbers.toSet().size == 6 })
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
            Lottery.MAIS_MILIONARIA, GenerationStrategy.RANDOM, 1, TrevoStrategy.COBERTURA_TOTAL,
        )
        val duplas = batch.games.single().trevoDuplas

        assertEquals(15, duplas.size)
        assertEquals(15, duplas.toSet().size)
        assertTrue(duplas.all { it.size == 2 })
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
            generator().generate(Lottery.MEGA_SENA, GenerationStrategy.RANDOM, 11)
        }
    }
}
