package com.volanteplus.loterias.ui.volante

import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VolanteViewModelTest {

    private fun viewModel() = VolanteViewModel()

    @Test
    fun `toggle marca e desmarca dezena`() {
        val vm = viewModel()
        vm.toggleNumber(7)
        assertEquals(setOf(7), vm.uiState.value.current.numbers)
        vm.toggleNumber(7)
        assertTrue(vm.uiState.value.current.numbers.isEmpty())
    }

    @Test
    fun `mega-sena bloqueia acima de 15 dezenas`() {
        val vm = viewModel()
        (1..15).forEach(vm::toggleNumber)
        vm.toggleNumber(16)
        assertEquals(15, vm.uiState.value.current.numbers.size)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `milionaria bloqueia acima de 12 dezenas`() {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        (1..12).forEach(vm::toggleNumber)
        vm.toggleNumber(13)
        assertEquals(12, vm.uiState.value.current.numbers.size)
    }

    @Test
    fun `selecao valida exige minimo de dezenas e 2 trevos na milionaria`() {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        (1..8).forEach(vm::toggleNumber)
        assertFalse(vm.uiState.value.isSelectionValid)
        vm.toggleTrevo(1)
        vm.toggleTrevo(2)
        assertTrue(vm.uiState.value.isSelectionValid)
    }

    @Test
    fun `bloqueia terceiro trevo`() {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        vm.toggleTrevo(1)
        vm.toggleTrevo(2)
        vm.toggleTrevo(3)
        assertEquals(setOf(1, 2), vm.uiState.value.current.trevos)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `troca de aba preserva selecao de cada loteria`() {
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
    fun `limpar mantem estrategia de trevos`() {
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
    fun `controle de lote incrementa e trava no maximo`() {
        val vm = viewModel()
        repeat(15) { vm.incrementBatchCount() }
        assertEquals(10, vm.uiState.value.batchCount)
        vm.setBatchCount(5)
        assertEquals(5, vm.uiState.value.batchCount)
    }

    @Test
    fun `gera lote com a quantidade e loteria atuais`() {
        val vm = viewModel()
        vm.setBatchCount(3)
        vm.generateBatch()

        val batch = vm.uiState.value.generatedBatch!!
        assertEquals(3, batch.games.size)
        assertEquals(Lottery.MEGA_SENA, batch.lottery)
        // sem repetição de dezenas entre os jogos do lote
        val all = batch.games.flatMap { it.numbers }
        assertEquals(all.size, all.toSet().size)
    }

    @Test
    fun `gera lote da milionaria com a estrategia de trevos selecionada`() {
        val vm = viewModel()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        vm.selectTrevoStrategy(TrevoStrategy.COBERTURA_TOTAL)
        vm.selectGenerationStrategy(GenerationStrategy.BALANCED)
        vm.generateBatch()

        val batch = vm.uiState.value.generatedBatch!!
        assertEquals(GenerationStrategy.BALANCED, batch.strategy)
        assertEquals(15, batch.games.single().trevoDuplas.size)
    }

    @Test
    fun `trocar de loteria descarta lote gerado`() {
        val vm = viewModel()
        vm.generateBatch()
        vm.selectLottery(Lottery.MAIS_MILIONARIA)
        assertEquals(null, vm.uiState.value.generatedBatch)
    }

    @Test
    fun `modo de jogo alterna entre avulsos e fechamento`() {
        val vm = viewModel()
        assertEquals(GameMode.JOGOS_AVULSOS, vm.uiState.value.gameMode)
        vm.selectGameMode(GameMode.FECHAMENTO)
        assertEquals(GameMode.FECHAMENTO, vm.uiState.value.gameMode)
    }
}
