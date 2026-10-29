package com.volanteplus.desktop.ui.backtest

import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.data.repository.InMemoryDrawRepository
import com.volanteplus.loterias.domain.backtest.BacktestEngine
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BacktestViewModelTest {

    private fun megaDraw(contest: Int, date: LocalDate) =
        Draw(Lottery.MEGA_SENA, contest, date, listOf(1, 2, 3, 4, 5, 6 + contest))

    private suspend fun repository() = InMemoryDrawRepository().apply {
        upsertAll((1..10).map { megaDraw(it, LocalDate.of(2024, 6, it)) })
    }

    private fun TestScope.viewModel(repo: InMemoryDrawRepository) = BacktestViewModel(
        engine = BacktestEngine(repo),
        repository = repo,
        dispatcher = StandardTestDispatcher(testScheduler),
    )

    @Test
    fun executaBacktestEPublicaRelatorio() = runTest {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.setCutoffInput("2024-06-05")
        vm.runBacktest()
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.report)
        assertFalse(vm.uiState.value.running)
        vm.dispose()
    }

    @Test
    fun trocarDeLoteriaCancelaOBacktestEmAndamento() = runTest {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.setCutoffInput("2024-06-05")
        vm.runBacktest()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        advanceUntilIdle()

        assertNull(vm.uiState.value.report)
        assertFalse(vm.uiState.value.running)
        assertEquals(Lottery.MAIS_MILIONARIA, vm.uiState.value.lottery)
        vm.dispose()
    }

    @Test
    fun sairDaTelaCancelaOBacktest() = runTest {
        val vm = viewModel(repository())
        advanceUntilIdle()
        vm.setCutoffInput("2024-06-05")
        vm.runBacktest()
        vm.cancelBacktest()
        advanceUntilIdle()

        assertNull(vm.uiState.value.report)
        assertFalse(vm.uiState.value.running)
        vm.dispose()
    }

    /** Repositório cujo histórico falha na leitura. */
    private class BrokenRepository(
        private val delegate: InMemoryDrawRepository,
    ) : DrawRepository by delegate {
        override suspend fun getDrawsUpTo(lottery: Lottery, cutoff: LocalDate): List<Draw> =
            throw IllegalStateException("leitura falhou")
    }

    @Test
    fun erroInesperadoViraMensagemELiberaOBotao() = runTest {
        val repo = BrokenRepository(repository())
        val vm = BacktestViewModel(
            engine = BacktestEngine(repo),
            repository = repo,
            dispatcher = StandardTestDispatcher(testScheduler),
        )
        advanceUntilIdle()
        vm.setCutoffInput("2024-06-05")
        vm.runBacktest()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.running)
        assertNull(vm.uiState.value.report)
        assertTrue(vm.uiState.value.message!!.contains("leitura falhou"))
        vm.dispose()
    }
}
