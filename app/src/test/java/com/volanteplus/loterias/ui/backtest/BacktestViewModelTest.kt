package com.volanteplus.loterias.ui.backtest

import com.volanteplus.loterias.data.remote.CaixaDrawDto
import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.data.remote.NextDrawDto
import com.volanteplus.loterias.domain.backtest.BacktestEngine
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.usecase.SyncDrawHistory
import com.volanteplus.loterias.data.repository.InMemoryDrawRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalCoroutinesApi::class)
class BacktestViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class FakeCaixaApi(private val latestContest: Int) : CaixaLotteryApi {
        private fun dto(contest: Int) = CaixaDrawDto(
            numero = contest,
            dataApuracao = LocalDate.of(2024, 1, 1).plusDays(contest.toLong())
                .format(DateTimeFormatter.ofPattern("dd/MM/yyyy")),
            listaDezenas = listOf("1", "2", "3", "4", "5", "${10 + contest}"),
        )

        override suspend fun fetchLatest(lottery: Lottery) = dto(latestContest)
        override suspend fun fetchContest(lottery: Lottery, contestNumber: Int) = dto(contestNumber)
        override suspend fun fetchNextDraw(lottery: Lottery): Result<NextDrawDto> =
            Result.failure(UnsupportedOperationException("não usado neste teste"))
    }

    private fun megaDraw(contest: Int, date: LocalDate) =
        Draw(Lottery.MEGA_SENA, contest, date, listOf(1, 2, 3, 4, 5, 6 + contest))

    private fun viewModel(
        repo: InMemoryDrawRepository,
        api: CaixaLotteryApi = FakeCaixaApi(latestContest = 1),
    ) = BacktestViewModel(
        engine = BacktestEngine(repo),
        repository = repo,
        syncDrawHistory = SyncDrawHistory(repo, api),
        seeder = null,
        computeDispatcher = dispatcher,
    )

    @Test
    fun `carrega contagem do historico ao iniciar`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll((1..4).map { megaDraw(it, LocalDate.of(2024, 6, it)) })

        val vm = viewModel(repo)
        advanceUntilIdle()

        assertEquals(4, vm.uiState.value.historyCount)
        assertEquals(4, vm.uiState.value.latestDraw?.contestNumber)
    }

    @Test
    fun `data de corte invalida marca erro sem executar`() = runTest {
        val vm = viewModel(InMemoryDrawRepository())
        advanceUntilIdle()

        vm.setCutoffInput("30/06/2024")
        vm.runBacktest()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.cutoffError)
        assertNull(vm.uiState.value.report)
    }

    @Test
    fun `executa backtest e publica relatorio`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll((1..10).map { megaDraw(it, LocalDate.of(2024, 6, it)) })

        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.setCutoffInput("2024-06-05")
        vm.runBacktest()
        advanceUntilIdle()

        val report = vm.uiState.value.report
        assertNotNull(report)
        assertEquals(5, report!!.trainingDraws)
        assertEquals(5, report.validationDraws)
    }

    @Test
    fun `trocar de loteria cancela o backtest em andamento`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll((1..10).map { megaDraw(it, LocalDate.of(2024, 6, it)) })

        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.setCutoffInput("2024-06-05")
        vm.runBacktest()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        advanceUntilIdle()

        assertNull(vm.uiState.value.report)
        assertFalse(vm.uiState.value.running)
        assertEquals(Lottery.MAIS_MILIONARIA, vm.uiState.value.lottery)
    }

    @Test
    fun `cancelar o backtest libera o botao sem publicar relatorio`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll((1..10).map { megaDraw(it, LocalDate.of(2024, 6, it)) })

        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.setCutoffInput("2024-06-05")
        vm.runBacktest()
        vm.cancelBacktest()
        advanceUntilIdle()

        assertNull(vm.uiState.value.report)
        assertFalse(vm.uiState.value.running)
    }

    @Test
    fun `corte sem concursos posteriores vira mensagem`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll(listOf(megaDraw(1, LocalDate.of(2024, 6, 1))))

        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.setCutoffInput("2030-01-01")
        vm.runBacktest()
        advanceUntilIdle()

        assertNull(vm.uiState.value.report)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `sincronizacao importa concursos e atualiza contagem`() = runTest {
        val repo = InMemoryDrawRepository()
        val vm = viewModel(repo, FakeCaixaApi(latestContest = 3))
        advanceUntilIdle()

        vm.syncHistory()
        advanceUntilIdle()

        assertEquals(3, vm.uiState.value.historyCount)
        assertTrue(vm.uiState.value.message!!.contains("Sincronizados: 3"))
    }
}
