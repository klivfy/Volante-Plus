package com.volanteplus.desktop.ui.volante

import com.volanteplus.desktop.ui.navigation.PerformanceCache
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.backtest.BacktestAnalyzer
import com.volanteplus.loterias.domain.backtest.BacktestConfig
import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.domain.usecase.GetNextDrawInfoUseCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicInteger

/**
 * Seleção de um volante individual. Mantida por loteria para que a troca de
 * abas não descarte o que o usuário já marcou.
 */
data class VolanteSelection(
    val numbers: Set<Int> = emptySet(),
    val trevos: Set<Int> = emptySet(),
    val trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
)

data class VolanteUiState(
    val lottery: Lottery,
    val gameMode: GameMode = GameMode.JOGOS_AVULSOS,
    val selections: Map<Lottery, VolanteSelection> =
        Lottery.entries.associateWith { VolanteSelection() },
    val batchCount: Int = GameGenerator.MIN_GAMES,
    val generatedBatch: GameBatch? = null,
    val message: String? = null,
) {
    val current: VolanteSelection
        get() = selections.getValue(lottery)

    val isSelectionValid: Boolean
        get() {
            val sel = current
            val numbersOk = sel.numbers.size in lottery.minSelection..lottery.maxSelection
            val trevosOk = !lottery.hasTrevos || sel.trevos.size == Lottery.TREVOS_REQUIRED
            return numbersOk && trevosOk
        }
}

/**
 * Adaptação desktop de `ui/volante/VolanteViewModel.kt` (Android): mesma
 * lógica, mas sem `androidx.lifecycle` — não há ciclo de vida de Activity
 * aqui, então este é um objeto Kotlin comum com seu próprio
 * [CoroutineScope], cancelado explicitamente em [dispose].
 *
 * @param initialLottery loteria com que a tela abre — vem de
 *   `DesktopPreferences.lastLottery` (última selecionada), persistida pelo
 *   chamador conforme [uiState] muda.
 * @param getNextDrawInfo null nos mesmos casos em que [repository] é null
 *   (testes, previews sem app real) — [nextDrawInfo] fica sempre nulo.
 */
class VolanteViewModel(
    private val generator: GameGenerator = GameGenerator(),
    private val analyzer: BacktestAnalyzer = BacktestAnalyzer(),
    private val repository: DrawRepository? = null,
    private val getNextDrawInfo: GetNextDrawInfoUseCase? = null,
    initialLottery: Lottery = Lottery.MEGA_SENA,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _uiState = MutableStateFlow(VolanteUiState(lottery = initialLottery))
    val uiState: StateFlow<VolanteUiState> = _uiState.asStateFlow()

    /** Dados do próximo concurso ainda não realizado, para a loteria ativa. */
    val nextDrawInfo: StateFlow<NextDrawInfo?> = uiState
        .map { it.lottery }
        .distinctUntilChanged()
        .flatMapLatest { lottery -> getNextDrawInfo?.invoke(lottery) ?: flowOf(null) }
        .stateIn(scope, SharingStarted.WhileSubscribed(5_000), null)

    private val _performances = MutableStateFlow<List<NumberPerformance>>(emptyList())
    val performances: StateFlow<List<NumberPerformance>> = _performances.asStateFlow()

    private val _trevoPerformances = MutableStateFlow<List<NumberPerformance>>(emptyList())

    private val _isAnalyzing = MutableStateFlow(false)
    val isAnalyzing: StateFlow<Boolean> = _isAnalyzing.asStateFlow()

    private val analysisGeneration = AtomicInteger(0)

    init {
        refreshPerformances()
    }

    fun selectLottery(lottery: Lottery) {
        if (lottery == _uiState.value.lottery) return
        _uiState.update { it.copy(lottery = lottery, generatedBatch = null, message = null) }
        refreshPerformances()
    }

    fun selectGameMode(mode: GameMode) {
        _uiState.update { it.copy(gameMode = mode, generatedBatch = null, message = null) }
    }

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

    fun toggleTrevo(trevo: Int) {
        _uiState.update { state ->
            require(state.lottery.hasTrevos) { "${state.lottery.displayName} não possui trevos" }
            require(trevo in Lottery.TREVO_RANGE) { "Trevo $trevo fora do intervalo" }
            val sel = state.current
            when {
                trevo in sel.trevos ->
                    state.withSelection(sel.copy(trevos = sel.trevos - trevo))

                sel.trevos.size >= Lottery.TREVOS_REQUIRED ->
                    state.copy(message = "Selecione exatamente ${Lottery.TREVOS_REQUIRED} trevos.")

                else ->
                    state.withSelection(sel.copy(trevos = sel.trevos + trevo))
            }
        }
    }

    fun selectTrevoStrategy(strategy: TrevoStrategy) {
        _uiState.update { state -> state.withSelection(state.current.copy(trevoStrategy = strategy)) }
    }

    fun clearSelection() {
        _uiState.update { state ->
            state.withSelection(VolanteSelection(trevoStrategy = state.current.trevoStrategy))
        }
    }

    fun setBatchCount(count: Int) {
        _uiState.update {
            it.copy(batchCount = count.coerceIn(GameGenerator.MIN_GAMES, GameGenerator.MAX_GAMES))
        }
    }

    fun generateGames(count: Int) {
        val state = _uiState.value
        val pool = if (state.gameMode == GameMode.FECHAMENTO) {
            val marked = state.current.numbers
            if (marked.size < state.lottery.minSelection) {
                _uiState.update {
                    it.copy(
                        message = "Fechamento: marque ao menos ${state.lottery.minSelection} " +
                            "dezenas no volante (marcadas: ${marked.size})."
                    )
                }
                return
            }
            marked
        } else {
            null
        }

        val performances = _performances.value
        if (performances.isEmpty()) {
            _uiState.update {
                it.copy(message = "Analisando o histórico — tente novamente em instantes.")
            }
            return
        }

        scope.launch {
            try {
                val batch = generator.generate(
                    lottery = state.lottery,
                    count = count,
                    performances = performances,
                    trevoPerformances = _trevoPerformances.value,
                    trevoStrategy = state.current.trevoStrategy,
                    pool = pool,
                )
                _uiState.update { it.copy(generatedBatch = batch, message = null) }
            } catch (e: IllegalArgumentException) {
                _uiState.update { it.copy(message = e.message) }
            }
        }
    }

    fun consumeMessage() {
        _uiState.update { it.copy(message = null) }
    }

    private fun refreshPerformances() {
        val lottery = _uiState.value.lottery
        val generation = analysisGeneration.incrementAndGet()

        PerformanceCache.get(lottery)?.let { snapshot ->
            _performances.value = snapshot.numbers
            _trevoPerformances.value = snapshot.trevos
            _isAnalyzing.value = false
            return
        }

        scope.launch {
            _isAnalyzing.value = true
            try {
                val cutoff = LocalDate.now()
                val draws = repository?.getDrawsUpTo(lottery, cutoff).orEmpty()
                val config = BacktestConfig(lottery = lottery, cutoff = cutoff)
                val numbers = analyzer.analyze(draws, config)
                val trevos = analyzer.analyzeTrevos(draws, config)
                if (generation == analysisGeneration.get()) {
                    _performances.value = numbers
                    _trevoPerformances.value = trevos
                }
            } finally {
                if (generation == analysisGeneration.get()) {
                    _isAnalyzing.value = false
                }
            }
        }
    }

    private fun VolanteUiState.withSelection(selection: VolanteSelection): VolanteUiState =
        copy(selections = selections + (lottery to selection), message = null)

    fun dispose() {
        scope.cancel()
    }
}
