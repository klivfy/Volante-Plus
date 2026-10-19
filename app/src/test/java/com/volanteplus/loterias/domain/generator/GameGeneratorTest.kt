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

    /**
     * Contrato do passo 2 (distribuição por tiers), isolado com
     * `payoutCandidates = 1`. Com o desempate por rateio ligado — o padrão —
     * esta proporção fica deliberadamente abaixo da meta, e o teste
     * `desempate por rateio prevalece sobre a meta do tier TOP` abaixo
     * documenta essa troca.
     */
    @Test
    fun `dezenas de maior peso dominam o lote na proporcao do tier TOP`() = runTest {
        // 24 de 60 dezenas (40%) formam o tier TOP; a meta é 70% das vagas.
        val topNumbers = (1..24).toSet()
        val performances = performances { if (it in topNumbers) 1.0 else 0.1 }

        val generator = generator()
        var slots = 0
        var fromTop = 0
        repeat(200) {
            val batch = generator.generate(
                Lottery.MEGA_SENA,
                GameGenerator.MAX_GAMES,
                performances,
                payoutCandidates = 1,
                // A estratégia padrão (UNPOPULAR) não usa pesos: o teste mede
                // a estratégia legada por tiers, que é o objeto do backtest.
                strategy = GenerationStrategy.FREQUENCY_TIERS,
            )
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
            val batch = generator.generate(
                Lottery.MEGA_SENA,
                GameGenerator.MAX_GAMES,
                performances,
                payoutCandidates = 1,
                strategy = GenerationStrategy.FREQUENCY_TIERS,
            )
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
        // resorteios se esgotam e o lote sai com jogos idênticos. O modo
        // "máximo valor" (disjointNumbers = false) permite repetir as dezenas;
        // no disjunto o lote saturaria em 1 jogo.
        val pool = setOf(2, 9, 17, 23, 31, 44)
        val batch = generator().generate(
            Lottery.MEGA_SENA, 3, performances(), pool = pool, disjointNumbers = false,
        )

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
        // WHY FREQUENCY_TIERS: a estratégia padrão sorteia os trevos de forma
        // uniforme (duplas complementares) e ignora o desempenho — o ranking
        // de trevos é medido pelo laboratório, não usado na geração.
        val trevos = trevoPerformances { if (it == 1) 1.0 else 0.01 }
        val generator = generator()
        val counts = IntArray(Lottery.TREVO_RANGE.last + 1)
        repeat(100) {
            val batch = generator.generate(
                lottery = Lottery.MAIS_MILIONARIA,
                count = GameGenerator.MAX_GAMES,
                performances = performances(Lottery.MAIS_MILIONARIA),
                trevoPerformances = trevos,
                strategy = GenerationStrategy.FREQUENCY_TIERS,
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
    /**
     * Regressão do viés de tier. Com todos os pesos iguais — o caso de
     * histórico vazio, em que o analisador declara devolver "sorteio puro" —
     * o ranking era decidido só pelo desempate por número, e o sorteio de
     * tier dava 70% das vagas às 24 primeiras dezenas. Sem informação, o
     * sorteio de base precisa ser uniforme.
     */
    @Test
    fun `pesos iguais nao criam tiers e a base do sorteio volta a ser uniforme`() = runTest {
        val lottery = Lottery.MEGA_SENA
        val iguais = performances(lottery) { 1.0 }
        val contagem = IntArray(61)
        // Sem gradiente de popularidade não há nada que desloque o sorteio:
        // usa o próprio gerador e mede o primeiro tier construído.
        repeat(3_000) { seed ->
            generator(seed.toLong()).generate(lottery, GameGenerator.MIN_GAMES, iguais)
                .games.forEach { game -> game.numbers.forEach { contagem[it]++ } }
        }
        val universo = lottery.numberRange.toList()
        val primeiras24 = universo.take(24).sumOf { contagem[it] }
        val total = universo.sumOf { contagem[it] }
        val fracao = primeiras24.toDouble() / total

        // Sob o viés antigo esta fração ficava em ~0,70. Uniforme daria 0,40;
        // a otimização de rateio a empurra para baixo, nunca para cima.
        assertTrue(
            "As 24 primeiras dezenas levaram ${"%.1f".format(fracao * 100)}% dos picks — " +
                "o viés de tier por empate voltou",
            fracao < 0.45,
        )
    }

    /**
     * O desempate por rateio precisa produzir jogos mensuravelmente menos
     * populares que o sorteio uniforme — é a única melhoria que o gerador
     * promete, então tem que ser verificável.
     */
    @Test
    fun `desempate por rateio entrega jogos menos populares que o sorteio uniforme`() = runTest {
        val lottery = Lottery.MEGA_SENA
        val iguais = performances(lottery) { 1.0 }

        val doGerador = (1..200).flatMap { seed ->
            generator(seed.toLong()).generate(lottery, GameGenerator.MIN_GAMES, iguais)
                .games.map { it.numbers }
        }
        val uniformes = run {
            val random = Random(987L)
            val universo = lottery.numberRange.toList()
            List(doGerador.size) {
                val g = LinkedHashSet<Int>(GameGenerator.GAME_SIZE)
                while (g.size < GameGenerator.GAME_SIZE) g += universo[random.nextInt(universo.size)]
                g.toList()
            }
        }

        val penalidadeGerador = doGerador.map { Unpopularity.penalty(lottery, it) }.average()
        val penalidadeUniforme = uniformes.map { Unpopularity.penalty(lottery, it) }.average()
        assertTrue(
            "Gerador ($penalidadeGerador) não ficou abaixo do uniforme ($penalidadeUniforme)",
            penalidadeGerador < penalidadeUniforme,
        )
    }

    /**
     * A contrapartida do teste acima: otimizar o rateio não pode concentrar
     * os lotes num punhado de combinações, ou os usuários do app passariam a
     * dividir prêmio entre si — exatamente o problema que a otimização evita.
     */
    @Test
    fun `desempate por rateio preserva a diversidade das combinacoes`() = runTest {
        val lottery = Lottery.MEGA_SENA
        val iguais = performances(lottery) { 1.0 }
        val jogos = (1..500).flatMap { seed ->
            generator(seed.toLong()).generate(lottery, GameGenerator.MAX_GAMES, iguais)
                .games.map { it.numbers.sorted() }
        }
        val distintos = jogos.toSet().size
        assertTrue(
            "Só $distintos combinações distintas em ${jogos.size} jogos",
            distintos >= jogos.size * 99 / 100,
        )
    }

    /**
     * A troca declarada na documentação do gerador (estratégia legada por
     * tiers), fixada em teste: quando as dezenas de melhor desempenho são
     * também as mais apostadas — aqui o tier TOP é 1..24, a faixa de
     * aniversário — o desempate por rateio prevalece e a meta do tier TOP
     * deixa de ser cumprida. É intencional: o peso por desempenho não altera
     * a chance de acertar, o rateio altera quanto se recebe.
     */
    @Test
    fun `desempate por rateio prevalece sobre a meta do tier TOP`() = runTest {
        val topNumbers = (1..24).toSet()
        val performances = performances { if (it in topNumbers) 1.0 else 0.1 }
        val generator = generator()

        suspend fun fracaoDoTop(payoutCandidates: Int): Double {
            var slots = 0
            var fromTop = 0
            repeat(200) {
                generator.generate(
                    Lottery.MEGA_SENA,
                    GameGenerator.MAX_GAMES,
                    performances,
                    payoutCandidates = payoutCandidates,
                    strategy = GenerationStrategy.FREQUENCY_TIERS,
                ).games.forEach { game ->
                    slots += game.numbers.size
                    fromTop += game.numbers.count { it in topNumbers }
                }
            }
            return fromTop.toDouble() / slots
        }

        val semOtimizacao = fracaoDoTop(1)
        val comOtimizacao = fracaoDoTop(GameGenerator.PAYOUT_CANDIDATES)

        assertTrue("Sem otimização o tier TOP deveria dominar: $semOtimizacao", semOtimizacao > 0.65)
        assertTrue(
            "Com otimização o tier TOP deveria ceder espaço: $comOtimizacao",
            comOtimizacao < semOtimizacao,
        )
    }

    /** Estratégia padrão: uniforme + desempate por rateio. */
    @Test
    fun `estrategia padrao rotula o lote como baixa popularidade`() = runTest {
        val batch = generator().generate(Lottery.MEGA_SENA, GameGenerator.MIN_GAMES, performances())
        assertEquals(GameGenerator.UNPOPULAR_STRATEGY_LABEL, batch.strategyLabel)
    }

    @Test
    fun `estrategia padrao ignora os pesos do historico`() = runTest {
        // Pesos extremamente enviesados para 1..10 não podem mudar a
        // frequência de escolha: o sorteio de base é uniforme.
        val enviesado = performances { if (it <= 10) 100.0 else 1.0 }
        val plano = performances { 1.0 }

        suspend fun fracaoDoBaixo(p: List<NumberPerformance>): Double {
            var baixas = 0
            var total = 0
            repeat(150) { seed ->
                generator(seed.toLong()).generate(Lottery.MEGA_SENA, GameGenerator.MIN_GAMES, p)
                    .games.forEach { game ->
                        baixas += game.numbers.count { it <= 10 }
                        total += game.numbers.size
                    }
            }
            return baixas.toDouble() / total
        }

        val enviesada = fracaoDoBaixo(enviesado)
        val plana = fracaoDoBaixo(plano)
        assertTrue(
            "pesos não deveriam mudar a distribuição (enviesada=$enviesada, plana=$plana)",
            kotlin.math.abs(enviesada - plana) < 0.02,
        )
    }

    @Test
    fun `trevos complementares - 3 jogos cobrem os 6 trevos com duplas disjuntas`() = runTest {
        repeat(100) { seed ->
            val batch = generator(seed.toLong()).generate(
                lottery = Lottery.MAIS_MILIONARIA,
                count = 3,
                performances = performances(Lottery.MAIS_MILIONARIA),
                trevoPerformances = trevoPerformances(),
                trevoStrategy = TrevoStrategy.ECONOMICO,
            )
            val duplas = batch.games.map { it.trevoDuplas.single() }
            assertEquals(3, duplas.toSet().size)
            assertEquals(6, duplas.flatten().toSet().size)
        }
    }

    @Test
    fun `trevos complementares - nunca repete dupla dentro do lote`() = runTest {
        for (count in GameGenerator.MIN_GAMES..GameGenerator.MAX_GAMES) {
            repeat(50) { seed ->
                val batch = generator(seed.toLong() * 10 + count).generate(
                    lottery = Lottery.MAIS_MILIONARIA,
                    count = count,
                    performances = performances(Lottery.MAIS_MILIONARIA),
                    trevoPerformances = trevoPerformances(),
                    trevoStrategy = TrevoStrategy.ECONOMICO,
                )
                val duplas = batch.games.map { it.trevoDuplas.single() }
                assertEquals(count, duplas.toSet().size)
            }
        }
    }

    /** Disjunção entre jogos (achado §4.2 do estudo de precisão). */
    @Test
    fun `estrategia padrao nao repete dezenas entre jogos por padrao`() = runTest {
        val batch = generator().generate(
            Lottery.MEGA_SENA, 4, performances(),
        )
        assertEquals(4, batch.games.size)
        assertEquals(24, batch.games.flatMap { it.numbers }.toSet().size)
    }

    @Test
    fun `modo maximo valor permite compartilhar dezenas entre jogos`() = runTest {
        var algumCompartilhamento = false
        repeat(50) { seed ->
            val batch = generator(seed.toLong()).generate(
                Lottery.MEGA_SENA, GameGenerator.MAX_GAMES, performances(),
                disjointNumbers = false,
            )
            val todas = batch.games.flatMap { it.numbers }
            if (todas.toSet().size < todas.size) algumCompartilhamento = true
            // mesmo relaxado, o jogo exato nunca se repete
            assertEquals(batch.games.size, batch.games.map { it.numbers }.toSet().size)
        }
        assertTrue(
            "com disjunção desligada, lotes devem compartilhar dezenas com frequência",
            algumCompartilhamento,
        )
    }

}
