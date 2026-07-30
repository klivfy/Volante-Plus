package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.backtest.PerformanceTier
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class GameGeneratorTest {

    private fun generator(seed: Long = 42L) = GameGenerator(Random(seed))

    /**
     * Desempenho sintético. O tier declarado é propositalmente sempre LOW:
     * o gerador tem de recalcular os tiers a partir do peso.
     */
    private fun performances(
        lottery: Lottery = Lottery.MEGA_SENA,
        weight: (Int) -> Double = { 1.0 },
    ): List<NumberPerformance> = lottery.numberRange.map { number ->
        NumberPerformance(
            number = number,
            lottery = lottery,
            hitCount = 0,
            simulatedHitRate = 0.0,
            weight = weight(number),
            tier = PerformanceTier.LOW,
        )
    }

    private fun trevoPerformances(weight: (Int) -> Double = { 1.0 }): List<NumberPerformance> =
        Lottery.TREVO_RANGE.map { trevo ->
            NumberPerformance(
                number = trevo,
                lottery = Lottery.MAIS_MILIONARIA,
                hitCount = 0,
                simulatedHitRate = 0.0,
                weight = weight(trevo),
                tier = PerformanceTier.LOW,
            )
        }

    @Test
    fun `jogo tem 6 dezenas ordenadas e distintas dentro do intervalo`() = runTest {
        val batch = generator().generate(Lottery.MEGA_SENA, GameGenerator.MIN_GAMES, performances())
        val game = batch.games.first()

        assertEquals(6, game.numbers.size)
        assertEquals(game.numbers.sorted(), game.numbers)
        assertEquals(6, game.numbers.toSet().size)
        assertTrue(game.numbers.all { it in Lottery.MEGA_SENA.numberRange })
    }

    @Test
    fun `lote respeita a quantidade pedida em toda a faixa valida`() = runTest {
        for (count in GameGenerator.MIN_GAMES..GameGenerator.MAX_GAMES) {
            val batch = generator().generate(Lottery.MEGA_SENA, count, performances())
            assertEquals(count, batch.games.size)
            assertTrue(batch.games.all { it.numbers.size == 6 && it.numbers.toSet().size == 6 })
        }
    }

    @Test
    fun `lote carrega o rotulo e o snapshot de desempenho`() = runTest {
        val performances = performances()
        val batch = generator().generate(Lottery.MEGA_SENA, 3, performances)

        assertEquals(GameBatch.STRATEGY_LABEL, batch.strategyLabel)
        assertEquals(performances.size, batch.performancesSnapshot.size)
    }

    @Test
    fun `quantidade fora do limite e rejeitada`() = runTest {
        listOf(0, 1, GameGenerator.MAX_GAMES + 1).forEach { count ->
            val error = runCatching {
                generator().generate(Lottery.MEGA_SENA, count, performances())
            }.exceptionOrNull()
            assertTrue("count=$count deveria falhar", error is IllegalArgumentException)
        }
    }

    @Test
    fun `desempenho vazio e rejeitado`() = runTest {
        val error = runCatching {
            generator().generate(Lottery.MEGA_SENA, 2, emptyList())
        }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    @Test
    fun `desempenho insuficiente para um jogo e rejeitado`() = runTest {
        val error = runCatching {
            generator().generate(
                Lottery.MEGA_SENA,
                2,
                performances().take(GameGenerator.GAME_SIZE - 1),
            )
        }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    @Test
    fun `dezenas de maior peso dominam o lote na proporcao do tier TOP`() = runTest {
        // 24 de 60 dezenas (40%) formam o tier TOP; a meta é 70% das vagas.
        val topNumbers = (1..24).toSet()
        val performances = performances { if (it in topNumbers) 1.0 else 0.1 }

        val generator = generator()
        var slots = 0
        var fromTop = 0
        repeat(200) {
            val batch = generator.generate(Lottery.MEGA_SENA, GameGenerator.MAX_GAMES, performances)
            batch.games.forEach { game ->
                slots += game.numbers.size
                fromTop += game.numbers.count { it in topNumbers }
            }
        }

        val ratio = fromTop.toDouble() / slots
        assertTrue("esperado ~${GameGenerator.TOP_TIER_SHARE}, obtido $ratio", ratio in 0.65..0.75)
    }

    @Test
    fun `dentro do tier a roleta respeita o peso relativo`() = runTest {
        // Apenas 1..6 têm peso; o restante do tier TOP (7..24) tem peso zero e
        // só entra depois que as seis primeiras se esgotam no jogo.
        val performances = performances { if (it <= 6) 1.0 else 0.0 }
        val generator = generator()
        var slots = 0
        var pesadas = 0
        repeat(100) {
            val batch = generator.generate(Lottery.MEGA_SENA, GameGenerator.MAX_GAMES, performances)
            batch.games.forEach { game ->
                slots += game.numbers.size
                pesadas += game.numbers.count { it <= 6 }
            }
        }
        val ratio = pesadas.toDouble() / slots
        assertTrue("dezenas com peso deveriam dominar, obtido $ratio", ratio > 0.5)
    }

    @Test
    fun `fechamento usa apenas as dezenas do pool`() = runTest {
        val pool = setOf(3, 7, 12, 19, 24, 33, 41, 55, 58, 60)
        val batch = generator().generate(Lottery.MEGA_SENA, 5, performances(), pool = pool)

        assertEquals(pool.sorted(), batch.sourcePool)
        assertTrue(batch.games.all { pool.containsAll(it.numbers) })
        assertTrue(batch.games.all { it.numbers.toSet().size == 6 })
        assertEquals(pool.size, batch.performancesSnapshot.size)
    }

    @Test
    fun `fechamento rejeita pool invalido`() = runTest {
        val poolPequeno = runCatching {
            generator().generate(Lottery.MEGA_SENA, 2, performances(), pool = setOf(1, 2, 3, 4, 5))
        }.exceptionOrNull()
        assertTrue(poolPequeno is IllegalArgumentException)

        val foraDoIntervalo = runCatching {
            generator().generate(
                Lottery.MAIS_MILIONARIA,
                2,
                performances(Lottery.MAIS_MILIONARIA),
                pool = setOf(1, 2, 3, 4, 5, 51),
            )
        }.exceptionOrNull()
        assertTrue(foraDoIntervalo is IllegalArgumentException)
    }

    @Test
    fun `fechamento minimo aceita jogos repetidos em vez de falhar`() = runTest {
        // Com exatamente 6 dezenas só existe uma combinação possível: os
        // resorteios se esgotam e o lote sai com jogos idênticos.
        val pool = setOf(2, 9, 17, 23, 31, 44)
        val batch = generator().generate(Lottery.MEGA_SENA, 3, performances(), pool = pool)

        assertEquals(3, batch.games.size)
        assertTrue(batch.games.all { it.numbers == pool.sorted() })
    }

    @Test
    fun `mega-sena nao recebe trevos`() = runTest {
        val batch = generator().generate(Lottery.MEGA_SENA, 3, performances())
        assertTrue(batch.games.all { it.trevoDuplas.isEmpty() })
    }

    @Test
    fun `modo economico gera exatamente 1 dupla de trevos valida`() = runTest {
        val batch = generator().generate(
            lottery = Lottery.MAIS_MILIONARIA,
            count = 3,
            performances = performances(Lottery.MAIS_MILIONARIA),
            trevoPerformances = trevoPerformances(),
            trevoStrategy = TrevoStrategy.ECONOMICO,
        )
        batch.games.forEach { game ->
            val dupla = game.trevoDuplas.single()
            assertEquals(2, dupla.size)
            assertTrue(dupla.all { it in Lottery.TREVO_RANGE })
        }
    }

    @Test
    fun `trevos sem desempenho caem no fallback de pesos iguais`() = runTest {
        val batch = generator().generate(
            lottery = Lottery.MAIS_MILIONARIA,
            count = GameGenerator.MAX_GAMES,
            performances = performances(Lottery.MAIS_MILIONARIA),
            trevoPerformances = emptyList(),
        )
        batch.games.forEach { game ->
            val dupla = game.trevoDuplas.single()
            assertEquals(2, dupla.size)
            assertTrue(dupla.all { it in Lottery.TREVO_RANGE })
        }
    }

    @Test
    fun `trevo de maior peso aparece mais que o de menor peso`() = runTest {
        val trevos = trevoPerformances { if (it == 1) 1.0 else 0.01 }
        val generator = generator()
        val counts = IntArray(Lottery.TREVO_RANGE.last + 1)
        repeat(100) {
            val batch = generator.generate(
                lottery = Lottery.MAIS_MILIONARIA,
                count = GameGenerator.MAX_GAMES,
                performances = performances(Lottery.MAIS_MILIONARIA),
                trevoPerformances = trevos,
            )
            batch.games.forEach { game -> game.trevoDuplas.single().forEach { counts[it]++ } }
        }
        assertTrue("trevo 1 deveria dominar: ${counts.toList()}", counts[1] > counts[6])
    }

    @Test
    fun `cobertura total gera as 15 duplas`() = runTest {
        val batch = generator().generate(
            lottery = Lottery.MAIS_MILIONARIA,
            count = GameGenerator.MIN_GAMES,
            performances = performances(Lottery.MAIS_MILIONARIA),
            trevoPerformances = trevoPerformances(),
            trevoStrategy = TrevoStrategy.COBERTURA_TOTAL,
        )
        val duplas = batch.games.first().trevoDuplas

        assertEquals(15, duplas.size)
        assertEquals(15, duplas.toSet().size)
        assertTrue(duplas.all { it.size == 2 })
    }

    @Test
    fun `mesma semente produz o mesmo lote`() = runTest {
        val performances = performances { it / 60.0 }
        val first = generator(7L).generate(Lottery.MEGA_SENA, 5, performances)
        val second = generator(7L).generate(Lottery.MEGA_SENA, 5, performances)
        assertEquals(first.games.map { it.numbers }, second.games.map { it.numbers })
    }

    @Test
    fun `lote evita jogos repetidos quando ha combinacoes suficientes`() = runTest {
        val batch = generator().generate(Lottery.MEGA_SENA, GameGenerator.MAX_GAMES, performances())
        val distinct = batch.games.map { it.numbers }.toSet()
        assertEquals(batch.games.size, distinct.size)
    }
}
