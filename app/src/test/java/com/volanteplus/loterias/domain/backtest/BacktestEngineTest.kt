package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.testutil.InMemoryDrawRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class BacktestEngineTest {

    private val cutoff: LocalDate = LocalDate.of(2024, 6, 30)

    private fun megaDraw(contest: Int, date: LocalDate) =
        Draw(Lottery.MEGA_SENA, contest, date, listOf(1, 2, 3, 4, 5, 6).map { it + contest % 10 })

    private suspend fun seededRepository(): InMemoryDrawRepository {
        val repo = InMemoryDrawRepository()
        // 5 concursos de treino (antes do corte) e 20 de validação (depois)
        repo.upsertAll((1..5).map { megaDraw(it, LocalDate.of(2024, 6, it)) })
        repo.upsertAll((6..25).map { megaDraw(it, LocalDate.of(2024, 7, it - 5)) })
        return repo
    }

    private fun config(gamesPerContest: Int = 3, seed: Long? = 42L) = BacktestConfig(
        lottery = Lottery.MEGA_SENA,
        strategy = GenerationStrategy.RANDOM,
        cutoff = cutoff,
        gamesPerContest = gamesPerContest,
        seed = seed,
    )

    @Test
    fun `separa janelas e contabiliza jogos por concurso de validacao`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config(gamesPerContest = 3))

        assertEquals(5, report.trainingDraws)
        assertEquals(20, report.validationDraws)
        assertEquals(60, report.totalGames)
        assertEquals(60, report.totalBets)
        assertEquals(60, report.hitDistribution.values.sum())
    }

    @Test
    fun `a unidade de analise e o concurso nao o jogo`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config(gamesPerContest = 3))

        // n da inferência = concursos de validação, não os 60 jogos gerados
        assertEquals(20, report.outcomes.size)
        assertEquals(20, report.stats.count)
        assertEquals(20, report.hypothesisTest.meanTest.sampleSize)
        assertEquals(60, report.totalGames)
    }

    @Test
    fun `media global e a media das medias por concurso`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config(gamesPerContest = 3))

        // com lotes de tamanho igual, a média das médias iguala a média global
        val totalHits = report.outcomes.sumOf { it.totalHits }
        assertEquals(totalHits.toDouble() / report.totalGames, report.stats.mean, 1e-9)
        assertEquals(
            report.outcomes.map { it.meanHits }.average(),
            report.stats.mean,
            1e-9,
        )
        assertTrue(report.stats.mean in 0.0..6.0)
        assertEquals(0.6, report.expectedMeanHits, 1e-9)
    }

    @Test
    fun `variancia amostral usa n menos 1 e alimenta o erro padrao`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config(gamesPerContest = 3))
        val stats = report.stats

        // n−1 > populacional (n) sempre que há dispersão
        assertEquals(
            stats.variance * stats.count / (stats.count - 1),
            stats.sampleVariance,
            1e-12,
        )
        assertEquals(
            stats.sampleStdDeviation / Math.sqrt(stats.count.toDouble()),
            stats.standardError,
            1e-12,
        )
        assertEquals(stats.standardError, report.hypothesisTest.meanTest.standardError, 1e-12)
    }

    @Test
    fun `acertos por concurso somam a distribuicao global`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config(gamesPerContest = 3))

        val fromOutcomes = report.outcomes
            .flatMap { it.hitsPerGame }
            .groupingBy { it }
            .eachCount()
        assertEquals(fromOutcomes, report.hitDistribution.toMap())
        report.outcomes.forEach { assertEquals(3, it.hitsPerGame.size) }
    }

    @Test
    fun `relatorio traz teste de hipotese e analise de premiacao coerentes`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config(gamesPerContest = 3))

        val prize = report.prizeAnalysis
        assertEquals(report.prizeCount, prize.prizeCount)
        assertEquals(report.totalBets, prize.totalBets)
        assertEquals(0.00043524, prize.theoreticalRate, 1e-7)
        assertEquals(prize.totalBets * prize.theoreticalRate, prize.expectedPrizes, 1e-12)
        // 60 apostas geram ~0,026 prêmio esperado: taxa inestimável nesta janela
        assertTrue(prize.underpowered)
        assertTrue(prize.wilsonInterval.upper > prize.observedRate)

        // 20 concursos não têm poder para o efeito mínimo de interesse
        assertEquals(Verdict.AMOSTRA_INSUFICIENTE, report.verdict)
        assertTrue(report.hypothesisTest.meanTest.power < 0.8)
        assertEquals(0.05, report.hypothesisTest.significanceLevel, 1e-12)
    }

    @Test
    fun `correcao de bonferroni divide o alfa pelas comparacoes`() = runTest {
        val report = BacktestEngine(seededRepository())
            .run(config(gamesPerContest = 3).copy(comparisons = 5))

        assertEquals(0.01, report.hypothesisTest.significanceLevel, 1e-12)
        assertEquals(5, report.hypothesisTest.comparisons)
    }

    @Test
    fun `distribuicao teorica exata acompanha o relatorio`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config(gamesPerContest = 3))

        assertEquals(1.0, report.theoreticalDistribution.values.sum(), 1e-12)
        assertEquals(0.5158844124, report.theoreticalDistribution.getValue(0), 1e-9)
        assertEquals(0.703020, report.expectedStdDeviation, 1e-5)
    }

    @Test
    fun `mesma semente reproduz o mesmo relatorio`() = runTest {
        val repo = seededRepository()
        val first = BacktestEngine(repo).run(config(seed = 7L))
        val second = BacktestEngine(repo).run(config(seed = 7L))
        assertEquals(first, second)
    }

    @Test
    fun `sem concursos apos o corte falha explicitamente`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll(listOf(megaDraw(1, LocalDate.of(2024, 1, 1))))

        val error = runCatching { BacktestEngine(repo).run(config()) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    @Test
    fun `cobertura total multiplica apostas efetivas na milionaria`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll(
            listOf(
                Draw(
                    Lottery.MAIS_MILIONARIA, 1, LocalDate.of(2024, 7, 10),
                    listOf(1, 2, 3, 4, 5, 6), listOf(1, 2),
                )
            )
        )

        val report = BacktestEngine(repo).run(
            BacktestConfig(
                lottery = Lottery.MAIS_MILIONARIA,
                strategy = GenerationStrategy.RANDOM,
                cutoff = cutoff,
                gamesPerContest = 2,
                trevoStrategy = TrevoStrategy.COBERTURA_TOTAL,
                seed = 42L,
            )
        )

        assertEquals(2, report.totalGames)
        assertEquals(30, report.totalBets) // 2 jogos × 15 duplas
        assertEquals(0.72, report.expectedMeanHits, 1e-9)
    }

    @Test
    fun `estrategia com historico roda sobre a janela de treino`() = runTest {
        val report = BacktestEngine(seededRepository()).run(
            config().copy(strategy = GenerationStrategy.FREQUENCY)
        )

        assertEquals(5, report.trainingDraws)
        assertEquals(60, report.totalGames)
    }

    @Test
    fun `estrategia com historico falha sem janela de treino`() = runTest {
        val repo = InMemoryDrawRepository()
        // apenas concursos após o corte: treino vazio
        repo.upsertAll(listOf(megaDraw(1, LocalDate.of(2024, 7, 10))))

        val error = runCatching {
            BacktestEngine(repo).run(config().copy(strategy = GenerationStrategy.FREQUENCY))
        }.exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
    }

    @Test
    fun `baseline hipergeometrico por loteria`() {
        assertEquals(0.6, BacktestEngine.expectedMeanHits(Lottery.MEGA_SENA), 1e-9)
        assertEquals(0.72, BacktestEngine.expectedMeanHits(Lottery.MAIS_MILIONARIA), 1e-9)
    }
}
