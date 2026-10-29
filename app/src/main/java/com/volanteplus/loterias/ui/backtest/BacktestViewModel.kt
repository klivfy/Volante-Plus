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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.logging.Level
import java.util.logging.Logger

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
    /**
     * Dispatcher usado para o cálculo pesado do backtest. É injetável para que
     * os testes possam passar o dispatcher do `runTest`: com `Dispatchers.Default`
     * fixo, o trabalho escapa do escalonador virtual e `advanceUntilIdle()`
     * retorna antes de o relatório ficar pronto.
     */
    private val computeDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BacktestUiState())
    val uiState: StateFlow<BacktestUiState> = _uiState.asStateFlow()

    /** Backtest em andamento; no máximo um por vez. */
    private var backtestJob: Job? = null

    init {
        refreshHistory()
    }

    fun selectLottery(lottery: Lottery) {
        // O backtest em andamento é da loteria anterior: continuar só gastaria CPU.
        cancelBacktest()
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
        backtestJob?.cancel()
        backtestJob = viewModelScope.launch {
            _uiState.update { it.copy(running = true, report = null, message = null) }
            try {
                // O motor faz Monte Carlo pesado (réplicas × concursos). Rodar
                // isso na coroutine de Main congelaria a UI e arriscaria um ANR.
                val report = withContext(computeDispatcher) {
                    engine.run(
                        BacktestConfig(
                            lottery = state.lottery,
                            cutoff = cutoff,
                            gamesPerContest = state.gamesPerContest,
                            trevoStrategy = state.trevoStrategy,
                        )
                    )
                }
                // Publica só na loteria que pediu o relatório: se a aba mudou no
                // meio, o resultado é de outra loteria e não pode aparecer aqui.
                _uiState.update {
                    if (it.lottery == report.config.lottery) it.copy(report = report) else it
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IllegalArgumentException) {
                _uiState.update { it.copy(message = e.message) }
            } catch (e: Exception) {
                // Erro inesperado (banco, memória do cálculo): vira mensagem em
                // vez de derrubar o app ou deixar o botão travado.
                logger.log(Level.WARNING, "Falha no backtest", e)
                _uiState.update {
                    it.copy(message = "Falha no backtest: ${e.message ?: e::class.simpleName}")
                }
            } finally {
                // Um backtest cancelado por outro mais novo não mexe no estado dele.
                if (backtestJob === coroutineContext[Job]) {
                    _uiState.update { it.copy(running = false) }
                }
            }
        }
    }

    /**
     * Interrompe o backtest em andamento. Chamado ao trocar de loteria e quando
     * a tela sai de composição: o motor verifica cancelamento a cada réplica,
     * então a CPU é liberada em seguida em vez de minutos depois.
     */
    fun cancelBacktest() {
        backtestJob?.cancel()
        backtestJob = null
        _uiState.update { it.copy(running = false) }
    }

    /**
     * Exporta o desempenho do último backtest para o PerformanceCache, de
     * onde o Volante o lê com prioridade sobre a análise local.
     */
    fun useReportForGeneration(): Boolean {
        val report = _uiState.value.report ?: return false
        // A chave vem do próprio relatório, nunca da aba ativa.
        PerformanceCache.store(
            lottery = report.config.lottery,
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

private val logger: Logger = Logger.getLogger(BacktestViewModel::class.java.name)
