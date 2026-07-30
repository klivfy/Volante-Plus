package com.volanteplus.loterias.domain.usecase

import com.volanteplus.loterias.data.remote.CaixaDrawDto
import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.data.remote.NextDrawDto
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.LocalDate

private class FakeDrawRepository : DrawRepository {
    val stored = sortedMapOf<Int, Draw>()

    override fun observeDraws(lottery: Lottery): Flow<List<Draw>> = flowOf(stored.values.toList())

    override suspend fun getDrawsUpTo(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        stored.values.filter { it.date <= cutoff }

    override suspend fun getDrawsAfter(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        stored.values.filter { it.date > cutoff }

    override suspend fun getLatestDraw(lottery: Lottery): Draw? = stored.values.lastOrNull()

    override suspend fun count(lottery: Lottery): Int = stored.size

    override suspend fun upsertAll(draws: List<Draw>) {
        draws.forEach { stored[it.contestNumber] = it }
    }

    override suspend fun deleteAll(lottery: Lottery) = stored.clear()
}

private class FakeCaixaApi(
    private val latestContest: Int,
    private val failingContests: Set<Int> = emptySet(),
) : CaixaLotteryApi {
    var fetchCount = 0

    private fun dto(contest: Int) = CaixaDrawDto(
        numero = contest,
        dataApuracao = LocalDate.of(2024, 1, 1).plusDays(contest.toLong())
            .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")),
        listaDezenas = listOf("1", "2", "3", "4", "5", "${10 + contest % 50}"),
    )

    override suspend fun fetchLatest(lottery: Lottery): CaixaDrawDto = dto(latestContest)

    override suspend fun fetchContest(lottery: Lottery, contestNumber: Int): CaixaDrawDto {
        fetchCount++
        if (contestNumber in failingContests) throw IOException("falha simulada")
        return dto(contestNumber)
    }

    override suspend fun fetchNextDraw(lottery: Lottery): Result<NextDrawDto> =
        Result.failure(UnsupportedOperationException("não usado neste teste"))
}

class SyncDrawHistoryTest {

    @Test
    fun `base vazia importa todos os concursos`() = runTest {
        val repo = FakeDrawRepository()
        val sync = SyncDrawHistory(repo, FakeCaixaApi(latestContest = 5))

        val result = sync(Lottery.MEGA_SENA)

        assertEquals(5, result.imported)
        assertEquals(5, result.latestContest)
        assertTrue(result.completed)
        assertEquals((1..5).toList(), repo.stored.keys.toList())
    }

    @Test
    fun `sincronizacao incremental busca apenas os faltantes`() = runTest {
        val repo = FakeDrawRepository()
        val api = FakeCaixaApi(latestContest = 5)
        SyncDrawHistory(repo, api)(Lottery.MEGA_SENA)
        val fetchesAfterFirstSync = api.fetchCount

        val result = SyncDrawHistory(repo, api)(Lottery.MEGA_SENA)

        assertEquals(0, result.imported)
        assertTrue(result.completed)
        assertEquals(fetchesAfterFirstSync, api.fetchCount)
    }

    @Test
    fun `falha no meio persiste progresso parcial`() = runTest {
        val repo = FakeDrawRepository()
        val sync = SyncDrawHistory(repo, FakeCaixaApi(latestContest = 5, failingContests = setOf(3)))

        val result = sync(Lottery.MEGA_SENA)

        assertFalse(result.completed)
        assertEquals(2, result.imported)
        assertEquals(listOf(1, 2), repo.stored.keys.toList())
        // próxima sincronização retoma do concurso 3
        val retry = SyncDrawHistory(repo, FakeCaixaApi(latestContest = 5))(Lottery.MEGA_SENA)
        assertTrue(retry.completed)
        assertEquals((1..5).toList(), repo.stored.keys.toList())
    }

    @Test
    fun `reporta progresso durante a importacao`() = runTest {
        val repo = FakeDrawRepository()
        val sync = SyncDrawHistory(repo, FakeCaixaApi(latestContest = 3))
        val progress = mutableListOf<Pair<Int, Int>>()

        sync(Lottery.MEGA_SENA) { done, total -> progress += done to total }

        assertEquals(listOf(1 to 3, 2 to 3, 3 to 3), progress)
    }
}
