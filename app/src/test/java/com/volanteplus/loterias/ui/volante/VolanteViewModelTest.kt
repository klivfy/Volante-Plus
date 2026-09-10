package com.volanteplus.loterias.ui.volante

import com.volanteplus.loterias.domain.backtest.BacktestAnalyzer
import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.backtest.PerformanceTier
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.ContestOutlook
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.data.repository.InMemoryDrawRepository
import com.volanteplus.loterias.ui.navigation.PerformanceCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
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

    private fun viewModel(
        repository: InMemoryDrawRepository? = null,
        outlookSource: OutlookSource? = null,
    ) = VolanteViewModel(
        generator = GameGenerator(Random(42L)),
        analyzer = BacktestAnalyzer(Random(42L)),
        repository = repository,
        outlookSource = outlookSource,
        workDispatcher = dispatcher,
    )

    /** Retrato com arrecadação suficiente para o rateio ser calculável. */
    private fun outlook(lottery: Lottery, collection: Double = 60_000_000.0) = ContestOutlook(
        lottery = lottery,
        lastContest = 2800,
        nextContest = 2801,
        nextDate = LocalDate.of(2026, 1, 10),
        accumulatedForNext = 40_000_000.0,
        estimatedTopPrize = 55_000_000.0,
        lastCollection = collection,
        lastAccumulated = true,
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

    @Test
    fun `rateio so e medido quando ha lote e arrecadacao`() = runTest {
        val vm = viewModel(outlookSource = { outlook(it) })
        backgroundScope.launch { vm.payoutAssessment.collect {} }
        advanceUntilIdle()

        // Retrato carregado, mas ainda sem lote: não há o que medir.
        assertNotNull(vm.uiState.value.outlook)
        assertNull(vm.payoutAssessment.value)

        vm.generateGames(3)
        advanceUntilIdle()

        val payout = vm.payoutAssessment.value!!
        assertEquals(3, payout.games.size)
        assertEquals(Lottery.MEGA_SENA, payout.lottery)
        assertTrue("apostas estimadas devem ser positivas", payout.tickets > 0.0)
    }

    @Test
    fun `sem arrecadacao o rateio nao e exibido`() = runTest {
        // WHY: sem saber quantas apostas concorrem o efeito do rateio não é
        // calculável, e exibir um ganho seria inventá-lo.
        val vm = viewModel(outlookSource = { outlook(it, collection = 0.0) })
        backgroundScope.launch { vm.payoutAssessment.collect {} }
        advanceUntilIdle()

        vm.generateGames(3)
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.generatedBatch)
        assertNull(vm.payoutAssessment.value)
    }

    @Test
    fun `descartar o lote descarta a medida de rateio`() = runTest {
        // A medida é derivada do estado, então não existe caminho em que ela
        // sobreviva ao lote que a originou.
        val vm = viewModel(outlookSource = { outlook(it) })
        backgroundScope.launch { vm.payoutAssessment.collect {} }
        advanceUntilIdle()
        vm.generateGames(2)
        advanceUntilIdle()
        assertNotNull(vm.payoutAssessment.value)

        vm.selectGameMode(GameMode.FECHAMENTO)
        advanceUntilIdle()

        assertNull(vm.payoutAssessment.value)
    }

    @Test
    fun `o gerador entrega jogos menos disputados que a media`() = runTest {
        // O núcleo do argumento: a chance de ganhar é intocável, mas o número
        // de pessoas com quem se divide o prêmio não é. Se o gerador não
        // batesse a combinação média, a etapa de rateio seria decorativa.
        val vm = viewModel(outlookSource = { outlook(it) })
        backgroundScope.launch { vm.payoutAssessment.collect {} }
        advanceUntilIdle()

        vm.generateGames(GameGenerator.MAX_GAMES)
        advanceUntilIdle()

        // Valores medidos com esta semente: popularidade média 0,59 e ganho
        // condicional de +4,1%, com os 5 jogos abaixo da média. Os limiares
        // ficam folgados de propósito — o que precisa valer é o sinal, não o
        // dígito, que muda legitimamente se a geração for reajustada.
        val payout = vm.payoutAssessment.value!!
        assertEquals(GameGenerator.MAX_GAMES, payout.games.size)
        assertTrue(
            "popularidade relativa média = ${payout.averageRelativePopularity}",
            payout.averageRelativePopularity < 1.0,
        )
        assertTrue(
            "ganho condicional médio = ${payout.averageConditionalGain}",
            payout.averageConditionalGain > 0.0,
        )
        assertTrue(
            "jogos abaixo da média = ${payout.betterThanAverageCount}",
            payout.betterThanAverageCount >= 4,
        )
    }

}
