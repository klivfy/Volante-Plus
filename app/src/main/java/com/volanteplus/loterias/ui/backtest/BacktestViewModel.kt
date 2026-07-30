package com.volanteplus.loterias.ui.backtest

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.volanteplus.loterias.VolanteApplication
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.data.seed.AssetDrawSeeder
import com.volanteplus.loterias.domain.backtest.BacktestConfig
import com.volanteplus.loterias.domain.backtest.BacktestEngine
import com.volanteplus.loterias.domain.backtest.BacktestReport
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.domain.usecase.SyncDrawHistory
import com.volanteplus.loterias.ui.navigation.PerformanceCache
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeParseException

data class BacktestUiState(
    val lottery: Lottery = Lottery.MEGA_SENA,
    val trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
    val gamesPerContest: Int = GameGenerator.MIN_GAMES,
    /** Data de corte digitada (ISO: aaaa-mm-dd). */
    val cutoffInput: String = "",
    val cutoffError: Boolean = false,
    val historyCount: Int = 0,
    val latestDraw: Draw? = null,
    val syncing: Boolean = false,
    val syncProgress: Pair<Int, Int>? = null,
    val running: Boolean = false,
    val report: BacktestReport? = null,
    val message: String? = null,
) {
    val canRun: Boolean
        get() = historyCount > 0 && cutoffInput.isNotBlank() && !running && !syncing
}

class BacktestViewModel(
    private val engine: BacktestEngine,
    private val repository: DrawRepository,
    private val syncDrawHistory: SyncDrawHistory,
    private val seeder: AssetDrawSeeder? = null,
    /** Onde roda o backtest (CPU); testes injetam um dispatcher de teste. */
    private val workDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BacktestUiState())
    val uiState: StateFlow<BacktestUiState> = _uiState.asStateFlow()

    init {
        refreshHistory()
    }

    fun selectLottery(lottery: Lottery) {
        _uiState.update { it.copy(lottery = lottery, report = null, message = null) }
        refreshHistory()
    }

    fun selectTrevoStrategy(trevoStrategy: TrevoStrategy) {
        _uiState.update { it.copy(trevoStrategy = trevoStrategy) }
    }

    fun setGamesPerContest(count: Int) {
        _uiState.update { it.copy(gamesPerContest = count) }
    }

    fun setCutoffInput(value: String) {
        _uiState.update { it.copy(cutoffInput = value, cutoffError = false) }
    }

    fun runBacktest() {
        val state = _uiState.value
        val cutoff = try {
            LocalDate.parse(state.cutoffInput.trim())
        } catch (_: DateTimeParseException) {
            _uiState.update { it.copy(cutoffError = true) }
            return
        }
        viewModelScope.launch(workDispatcher) {
            _uiState.update { it.copy(running = true, report = null, message = null) }
            try {
                val report = engine.run(
                    BacktestConfig(
                        lottery = state.lottery,
                        cutoff = cutoff,
                        gamesPerContest = state.gamesPerContest,
                        trevoStrategy = state.trevoStrategy,
                    )
                )
                _uiState.update { it.copy(running = false, report = report) }
            } catch (e: IllegalArgumentException) {
                _uiState.update { it.copy(running = false, message = e.message) }
            }
        }
    }

    /**
     * Exporta o desempenho do último backtest para o PerformanceCache, de
     * onde o Volante o lê com prioridade sobre a análise local.
     */
    fun useReportForGeneration(): Boolean {
        val state = _uiState.value
        val report = state.report ?: return false
        PerformanceCache.store(
            lottery = state.lottery,
            snapshot = PerformanceCache.Snapshot(
                numbers = report.performances,
                trevos = report.trevoPerformances,
            ),
        )
        return true
    }

    /** Seed (se vazio) + sincronização incremental com a API da Caixa. */
    fun syncHistory() {
        viewModelScope.launch {
            _uiState.update { it.copy(syncing = true, syncProgress = null, message = null) }
            try {
                val lottery = _uiState.value.lottery
                val seeded = seeder?.seedIfEmpty(lottery) ?: 0
                val result = syncDrawHistory(lottery) { done, total ->
                    _uiState.update { it.copy(syncProgress = done to total) }
                }
                val summary = buildString {
                    if (seeded > 0) append("Seed: $seeded concursos. ")
                    append("Sincronizados: ${result.imported}.")
                    if (!result.completed) append(" Interrompido — tente novamente para retomar.")
                }
                _uiState.update { it.copy(message = summary) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(message = "Falha na sincronização: ${e.message ?: "erro de rede"}")
                }
            } finally {
                _uiState.update { it.copy(syncing = false, syncProgress = null) }
                refreshHistory()
            }
        }
    }

    fun consumeMessage() {
        _uiState.update { it.copy(message = null) }
    }

    private fun refreshHistory() {
        viewModelScope.launch {
            val lottery = _uiState.value.lottery
            val count = repository.count(lottery)
            val latest = repository.getLatestDraw(lottery)
            _uiState.update { it.copy(historyCount = count, latestDraw = latest) }
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[APPLICATION_KEY] as VolanteApplication
                BacktestViewModel(
                    engine = app.backtestEngine,
                    repository = app.drawRepository,
                    syncDrawHistory = app.syncDrawHistory,
                    seeder = app.drawSeeder,
                )
            }
        }
    }
}
