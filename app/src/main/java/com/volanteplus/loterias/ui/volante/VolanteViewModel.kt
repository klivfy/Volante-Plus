package com.volanteplus.loterias.ui.volante

import androidx.lifecycle.ViewModel
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Seleção de um volante individual. Mantida por loteria para que a troca
 * de abas não descarte o que o usuário já marcou.
 */
data class VolanteSelection(
    val numbers: Set<Int> = emptySet(),
    val trevos: Set<Int> = emptySet(),
    val trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
)

data class VolanteUiState(
    val lottery: Lottery = Lottery.MEGA_SENA,
    val gameMode: GameMode = GameMode.JOGOS_AVULSOS,
    val selections: Map<Lottery, VolanteSelection> =
        Lottery.entries.associateWith { VolanteSelection() },
    /** Controle de lote do gerador ("QUANTOS JOGOS"). */
    val batchCount: Int = GameGenerator.MIN_GAMES,
    val generationStrategy: GenerationStrategy = GenerationStrategy.RANDOM,
    val generatedBatch: GameBatch? = null,
    /** Mensagem transitória (ex.: limite de dezenas atingido). */
    val message: String? = null,
) {
    val current: VolanteSelection
        get() = selections.getValue(lottery)

    /** Volante válido: dezenas dentro dos limites e, se exigido, 2 trevos. */
    val isSelectionValid: Boolean
        get() {
            val sel = current
            val numbersOk = sel.numbers.size in lottery.minSelection..lottery.maxSelection
            val trevosOk = !lottery.hasTrevos || sel.trevos.size == Lottery.TREVOS_REQUIRED
            return numbersOk && trevosOk
        }
}

class VolanteViewModel(
    private val generator: GameGenerator = GameGenerator(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(VolanteUiState())
    val uiState: StateFlow<VolanteUiState> = _uiState.asStateFlow()

    fun selectLottery(lottery: Lottery) {
        _uiState.update { it.copy(lottery = lottery, generatedBatch = null, message = null) }
    }

    fun selectGameMode(mode: GameMode) {
        _uiState.update { it.copy(gameMode = mode, generatedBatch = null, message = null) }
    }

    /** Toque para marcar/desmarcar respeitando o máximo da loteria ativa. */
    fun toggleNumber(number: Int) {
        _uiState.update { state ->
            val lottery = state.lottery
            require(number in lottery.numberRange) {
                "Dezena $number fora do intervalo de ${lottery.displayName}"
            }
            val sel = state.current
            when {
                number in sel.numbers ->
                    state.withSelection(sel.copy(numbers = sel.numbers - number))

                sel.numbers.size >= lottery.maxSelection ->
                    state.copy(
                        message = "Máximo de ${lottery.maxSelection} dezenas para ${lottery.displayName}."
                    )

                else ->
                    state.withSelection(sel.copy(numbers = sel.numbers + number))
            }
        }
    }

    /** Toque para marcar/desmarcar trevos, limitado a exatamente 2 marcados. */
    fun toggleTrevo(trevo: Int) {
        _uiState.update { state ->
            require(state.lottery.hasTrevos) { "${state.lottery.displayName} não possui trevos" }
            require(trevo in Lottery.TREVO_RANGE) { "Trevo $trevo fora do intervalo" }
            val sel = state.current
            when {
                trevo in sel.trevos ->
                    state.withSelection(sel.copy(trevos = sel.trevos - trevo))

                sel.trevos.size >= Lottery.TREVOS_REQUIRED ->
                    state.copy(
                        message = "Selecione exatamente ${Lottery.TREVOS_REQUIRED} trevos."
                    )

                else ->
                    state.withSelection(sel.copy(trevos = sel.trevos + trevo))
            }
        }
    }

    fun selectTrevoStrategy(strategy: TrevoStrategy) {
        _uiState.update { state ->
            state.withSelection(state.current.copy(trevoStrategy = strategy))
        }
    }

    fun clearSelection() {
        _uiState.update { state ->
            state.withSelection(VolanteSelection(trevoStrategy = state.current.trevoStrategy))
        }
    }

    /** Botão "+1" do controle de lote. */
    fun incrementBatchCount() {
        _uiState.update {
            it.copy(batchCount = (it.batchCount + 1).coerceAtMost(GameGenerator.MAX_GAMES))
        }
    }

    /** Botões de quantidade fixa (3, 5, 10) do controle de lote. */
    fun setBatchCount(count: Int) {
        _uiState.update {
            it.copy(batchCount = count.coerceIn(GameGenerator.MIN_GAMES, GameGenerator.MAX_GAMES))
        }
    }

    fun selectGenerationStrategy(strategy: GenerationStrategy) {
        _uiState.update { it.copy(generationStrategy = strategy) }
    }

    fun generateBatch() {
        _uiState.update { state ->
            if (state.generationStrategy.requiresHistory) {
                return@update state.copy(
                    message = "A estratégia ${state.generationStrategy.displayName} " +
                        "só roda na tela de Backtesting."
                )
            }
            val pool = if (state.gameMode == GameMode.FECHAMENTO) {
                val marked = state.current.numbers
                if (marked.size < state.lottery.minSelection) {
                    return@update state.copy(
                        message = "Fechamento: marque ao menos ${state.lottery.minSelection} " +
                            "dezenas no volante (marcadas: ${marked.size})."
                    )
                }
                marked
            } else {
                null
            }
            state.copy(
                generatedBatch = generator.generate(
                    lottery = state.lottery,
                    strategy = state.generationStrategy,
                    gameCount = state.batchCount,
                    trevoStrategy = state.current.trevoStrategy,
                    pool = pool,
                ),
                message = null,
            )
        }
    }

    fun consumeMessage() {
        _uiState.update { it.copy(message = null) }
    }

    private fun VolanteUiState.withSelection(selection: VolanteSelection): VolanteUiState =
        copy(selections = selections + (lottery to selection), message = null)
}
