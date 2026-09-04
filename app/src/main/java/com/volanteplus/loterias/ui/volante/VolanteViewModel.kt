package com.volanteplus.loterias.ui.volante

import androidx.lifecycle.ViewModel
import com.volanteplus.loterias.domain.generator.ClosureDesign
import com.volanteplus.loterias.domain.generator.ClosureDesigner
import com.volanteplus.loterias.domain.generator.ClosureGuarantee
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
    val batchCount: Int = 1,
    val generationStrategy: GenerationStrategy = GenerationStrategy.RANDOM,
    /** Garantia pedida no modo Fechamento. */
    val closureGuarantee: ClosureGuarantee = ClosureGuarantee.QUADRA,
    val generatedBatch: GameBatch? = null,
    /** Mensagem transitória (ex.: limite de dezenas atingido). */
    val message: String? = null,
) {
    val current: VolanteSelection
        get() = selections.getValue(lottery)

    /**
     * Desdobramento aplicável às dezenas já marcadas, ou null quando a
     * quantidade marcada está fora da faixa com garantia conhecida.
     */
    val closureDesign: ClosureDesign?
        get() = if (gameMode == GameMode.FECHAMENTO) {
            ClosureDesigner.design(current.numbers.size, closureGuarantee)
        } else {
            null
        }

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
            it.copy(batchCount = count.coerceIn(1, GameGenerator.MAX_GAMES))
        }
    }

    fun selectGenerationStrategy(strategy: GenerationStrategy) {
        _uiState.update { it.copy(generationStrategy = strategy) }
    }

    fun selectClosureGuarantee(guarantee: ClosureGuarantee) {
        _uiState.update { it.copy(closureGuarantee = guarantee, generatedBatch = null) }
    }

    fun generateBatch() {
        _uiState.update { state ->
            if (state.generationStrategy.requiresHistory) {
                return@update state.copy(
                    message = "A estratégia ${state.generationStrategy.displayName} " +
                        "só roda na tela de Backtesting."
                )
            }
            if (state.gameMode == GameMode.FECHAMENTO) {
                // A garantia é sobre as 6 dezenas. Na +Milionária as faixas
                // também exigem trevos, então "quadra garantida" não se
                // traduz em prêmio garantido e o fechamento seria uma
                // promessa falsa. Melhor recusar do que prometer errado.
                if (state.lottery.hasTrevos) {
                    return@update state.copy(
                        message = "Fechamento com garantia só vale para a " +
                            "Mega-Sena. Na ${state.lottery.displayName} as faixas " +
                            "também dependem dos trevos, e acertar dezenas não " +
                            "garante prêmio."
                    )
                }
                val marked = state.current.numbers
                if (marked.size < state.lottery.minSelection) {
                    return@update state.copy(
                        message = "Fechamento: marque ao menos ${state.lottery.minSelection} " +
                            "dezenas no volante (marcadas: ${marked.size})."
                    )
                }
                // Desdobramento por covering design: a garantia vale no pior
                // caso. A antiga regra de repetição mínima não garantia
                // coisa alguma.
                val design = ClosureDesigner.design(marked.size, state.closureGuarantee)
                    ?: return@update state.copy(
                        message = "Não há fechamento com garantia de " +
                            "${state.closureGuarantee.label} para ${marked.size} dezenas. " +
                            "Marque de ${ClosureDesigner.SUPPORTED_POOL_SIZES.first} a " +
                            "${ClosureDesigner.SUPPORTED_POOL_SIZES.last} dezenas."
                    )
                return@update state.copy(
                    generatedBatch = GameBatch(
                        lottery = state.lottery,
                        strategy = state.generationStrategy,
                        games = design.apply(marked.toList()),
                        sourcePool = marked.sorted(),
                    ),
                    message = null,
                )
            }
            state.copy(
                generatedBatch = generator.generate(
                    lottery = state.lottery,
                    strategy = state.generationStrategy,
                    gameCount = state.batchCount,
                    trevoStrategy = state.current.trevoStrategy,
                    pool = null,
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
