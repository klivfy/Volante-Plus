package com.volanteplus.loterias.ui.volante

import com.volanteplus.loterias.domain.backtest.BacktestAnalyzer
import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.backtest.PerformanceTier
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.data.repository.InMemoryDrawRepository
import com.volanteplus.loterias.ui.navigation.PerformanceCache
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
import java.util.Random

@OptIn(ExperimentalCoroutinesApi::class)
class VolanteViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        // PerformanceCache é um singleton compartilhado pela JVM de testes.
        PerformanceCache.clear()
    }

    private fun viewModel(repository: InMemoryDrawRepository? = null) = VolanteViewModel(
        generator = GameGenerator(Random(42L)),
        analyzer = BacktestAnalyzer(Random(42L)),
        repository = repository,
        workDispatcher = dispatcher,
    )

    private fun performances(lottery: Lottery, weight: (Int) -> Double) =
        lottery.numberRange.map { number ->
            NumberPerformance(
                number = number,
                lottery = lottery,
                hitCount = 0,
                simulatedHitRate = 0.0,
                weight = weight(number),
                tier = PerformanceTier.MID,
            )
        }

    @Test
    fun `toggle marca e desmarca dezena`() = runTest {
        val vm = viewModel()
        vm.toggleNumber(7)
        assertEquals(setOf(7), vm.uiState.value.current.numbers)
        vm.toggleNumber(7)
        assertTrue(vm.uiState.value.current.numbers.isEmpty())
    }

    @Test
    fun `mega-sena bloqueia acima de 15 dezenas`() = runTest {
        val vm = viewModel()
        (1..15).forEach(vm::toggleNumber)
        vm.toggleNumber(16)
        assertEquals(15, vm.uiState.value.current.numbers.size)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `milionaria bloqueia acima de 12 dezenas`() = runTest {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        (1..12).forEach(vm::toggleNumber)
        vm.toggleNumber(13)
        assertEquals(12, vm.uiState.value.current.numbers.size)
    }

    @Test
    fun `selecao valida exige minimo de dezenas e 2 trevos na milionaria`() = runTest {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        (1..8).forEach(vm::toggleNumber)
        assertFalse(vm.uiState.value.isSelectionValid)
        vm.toggleTrevo(1)
        vm.toggleTrevo(2)
        assertTrue(vm.uiState.value.isSelectionValid)
    }

    @Test
    fun `bloqueia terceiro trevo`() = runTest {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        vm.toggleTrevo(1)
        vm.toggleTrevo(2)
        vm.toggleTrevo(3)
        assertEquals(setOf(1, 2), vm.uiState.value.current.trevos)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `troca de aba preserva selecao de cada loteria`() = runTest {
        val vm = viewModel()
        vm.toggleNumber(10)
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        vm.toggleNumber(20)
        vm.selectLottery(Lottery.MEGA_SENA)
        assertEquals(setOf(10), vm.uiState.value.current.numbers)
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        assertEquals(setOf(20), vm.uiState.value.current.numbers)
    }

    @Test
    fun `limpar mantem estrategia de trevos`() = runTest {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        vm.selectTrevoStrategy(TrevoStrategy.COBERTURA_TOTAL)
        vm.toggleNumber(5)
        vm.toggleTrevo(1)
        vm.clearSelection()
        val sel = vm.uiState.value.current
        assertTrue(sel.numbers.isEmpty())
        assertTrue(sel.trevos.isEmpty())
        assertEquals(TrevoStrategy.COBERTURA_TOTAL, sel.trevoStrategy)
    }

    @Test
    fun `controle de lote incrementa e trava no maximo`() = runTest {
        val vm = viewModel()
        repeat(15) { vm.incrementBatchCount() }
        assertEquals(GameGenerator.MAX_GAMES, vm.uiState.value.batchCount)
        vm.setBatchCount(GameGenerator.MAX_GAMES + 3)
        assertEquals(GameGenerator.MAX_GAMES, vm.uiState.value.batchCount)
        vm.setBatchCount(0)
        assertEquals(GameGenerator.MIN_GAMES, vm.uiState.value.batchCount)
    }

    @Test
    fun `analise local roda ao iniciar e alimenta o gerador`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll(
            (1..5).map {
                Draw(Lottery.MEGA_SENA, it, LocalDate.of(2024, 1, it), listOf(7, 8, 9, 10, 11, 12))
            }
        )

        val vm = viewModel(repo)
        advanceUntilIdle()

        assertFalse(vm.isAnalyzing.value)
        assertEquals(Lottery.MEGA_SENA.numberRange.count(), vm.performances.value.size)
        assertEquals(5, vm.performances.value.first { it.number == 7 }.hitCount)
    }

    @Test
    fun `sem repositorio a analise devolve pesos uniformes`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()

        assertEquals(1, vm.performances.value.map { it.weight }.distinct().size)
    }

    @Test
    fun `gera lote com a quantidade e loteria atuais`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()

        vm.setBatchCount(3)
        vm.generateGames(3)
        advanceUntilIdle()

        val batch = vm.uiState.value.generatedBatch!!
        assertEquals(3, batch.games.size)
        assertEquals(Lottery.MEGA_SENA, batch.lottery)
        assertEquals(GameBatch.STRATEGY_LABEL, batch.strategyLabel)
        assertTrue(batch.games.all { it.numbers.size == 6 && it.numbers == it.numbers.sorted() })
    }

    @Test
    fun `gera lote da milionaria com a estrategia de trevos selecionada`() = runTest {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        vm.selectTrevoStrategy(TrevoStrategy.COBERTURA_TOTAL)
        advanceUntilIdle()

        vm.generateGames(2)
        advanceUntilIdle()

        val batch = vm.uiState.value.generatedBatch!!
        assertEquals(Lottery.MAIS_MILIONARIA, batch.lottery)
        assertEquals(15, batch.games.first().trevoDuplas.size)
    }

    @Test
    fun `quantidade fora da faixa vira mensagem em vez de lote`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()

        vm.generateGames(GameGenerator.MAX_GAMES + 1)
        advanceUntilIdle()

        assertNull(vm.uiState.value.generatedBatch)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `trocar de loteria descarta lote gerado`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()
        vm.generateGames(2)
        advanceUntilIdle()

        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        assertNull(vm.uiState.value.generatedBatch)
    }

    @Test
    fun `fechamento gera jogos apenas com as dezenas marcadas`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()

        val marked = listOf(2, 9, 17, 23, 31, 44, 52, 60)
        marked.forEach(vm::toggleNumber)
        vm.selectGameMode(GameMode.FECHAMENTO)
        vm.generateGames(3)
        advanceUntilIdle()

        val batch = vm.uiState.value.generatedBatch!!
        assertEquals(marked.sorted(), batch.sourcePool)
        assertTrue(batch.games.all { marked.containsAll(it.numbers) })
    }

    @Test
    fun `fechamento sem o minimo de dezenas gera mensagem`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()

        (1..7).forEach(vm::toggleNumber)
        vm.selectGameMode(GameMode.FECHAMENTO)
        vm.generateGames(2)
        advanceUntilIdle()

        assertNull(vm.uiState.value.generatedBatch)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `trocar modo de jogo descarta lote gerado`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()
        vm.generateGames(2)
        advanceUntilIdle()

        vm.selectGameMode(GameMode.FECHAMENTO)
        assertNull(vm.uiState.value.generatedBatch)
    }

    @Test
    fun `cache de backtest tem prioridade sobre a analise local`() = runTest {
        val cached = performances(Lottery.MEGA_SENA) { if (it <= 6) 1.0 else 0.0 }
        PerformanceCache.store(Lottery.MEGA_SENA, PerformanceCache.Snapshot(numbers = cached))

        val repo = InMemoryDrawRepository()
        repo.upsertAll(
            (1..5).map {
                Draw(Lottery.MEGA_SENA, it, LocalDate.of(2024, 1, it), listOf(7, 8, 9, 10, 11, 12))
            }
        )

        val vm = viewModel(repo)
        advanceUntilIdle()

        assertEquals(cached, vm.performances.value)
        assertFalse(vm.isAnalyzing.value)
    }

    @Test
    fun `troca de loteria recalcula o desempenho`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()
        assertEquals(Lottery.MEGA_SENA.numberRange.count(), vm.performances.value.size)

        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        advanceUntilIdle()
        assertEquals(Lottery.MAIS_MILIONARIA.numberRange.count(), vm.performances.value.size)
        assertTrue(vm.performances.value.all { it.lottery == Lottery.MAIS_MILIONARIA })
    }
}
