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
    fun `estatisticas sao consistentes com a distribuicao de acertos`() = runTest {
        val report = BacktestEngine(seededRepository()).run(config())

        // reconstrói em ordem diferente da original: compara com tolerância,
        // pois a soma de Doubles não é associativa
        val hits = report.hitDistribution.flatMap { (hit, count) -> List(count) { hit } }
        val expected = Statistics.of(hits)
        assertEquals(expected.mean, report.stats.mean, 1e-9)
        assertEquals(expected.variance, report.stats.variance, 1e-9)
        assertEquals(expected.stdDeviation, report.stats.stdDeviation, 1e-9)
        assertTrue(report.stats.mean in 0.0..6.0)
        assertEquals(0.6, report.expectedMeanHits, 1e-9)
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
