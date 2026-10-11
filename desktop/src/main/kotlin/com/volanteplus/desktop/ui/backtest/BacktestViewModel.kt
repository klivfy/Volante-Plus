package com.volanteplus.desktop.ui.backtest

import com.volanteplus.desktop.ui.navigation.PerformanceCache
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.data.seed.CsvDrawParser
import com.volanteplus.loterias.domain.backtest.BacktestConfig
import com.volanteplus.loterias.domain.backtest.BacktestEngine
import com.volanteplus.loterias.domain.backtest.BacktestReport
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
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
    val importing: Boolean = false,
    val running: Boolean = false,
    val report: BacktestReport? = null,
    val message: String? = null,
) {
    val canRun: Boolean
        get() = historyCount > 0 && cutoffInput.isNotBlank() && !running && !importing
}

/**
 * Adaptação desktop de `ui/backtest/BacktestViewModel.kt` (Android). Sem
 * `androidx.lifecycle` (classe comum com [CoroutineScope] próprio, igual ao
 * [com.volanteplus.desktop.ui.volante.VolanteViewModel]) e sem sincronização
 * via API/Room: o desktop ainda não tem persistência (ver docs/DESKTOP.md),
 * então o histórico entra por [importCsv] — mesmo formato/parser do seed do
 * Android ([CsvDrawParser]), mas lido de um arquivo escolhido pelo usuário
 * em vez de um asset embarcado.
 */
class BacktestViewModel(
    private val engine: BacktestEngine,
    private val repository: DrawRepository,
    private val parser: CsvDrawParser = CsvDrawParser(),
    /** Injetável para os testes passarem o dispatcher do `runTest`. */
    dispatcher: CoroutineDispatcher = Dispatchers.Default,
) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    /** Backtest em andamento; no máximo um por vez. */
    private var backtestJob: Job? = null

    private val _uiState = MutableStateFlow(BacktestUiState())
    val uiState: StateFlow<BacktestUiState> = _uiState.asStateFlow()

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
        // Antes do launch: o corpo roda em outra thread, e dois cliques rápidos
        // passariam pelo canRun antes de o primeiro marcar running.
        _uiState.update { it.copy(running = true, report = null, message = null) }
        backtestJob = scope.launch {
            try {
                val report = engine.run(
                    BacktestConfig(
                        lottery = state.lottery,
                        cutoff = cutoff,
                        gamesPerContest = state.gamesPerContest,
                        trevoStrategy = state.trevoStrategy,
                    )
                )
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
     * Exporta o desempenho do último backtest para o [PerformanceCache], de
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

    /** Importa um CSV no mesmo formato do seed do Android (ver [CsvDrawParser]). */
    fun importCsv(file: File) {
        scope.launch {
            _uiState.update { it.copy(importing = true, message = null) }
            try {
                val lottery = _uiState.value.lottery
                val content = file.readText()
                val draws = parser.parse(lottery, content)
                repository.upsertAll(draws)
                _uiState.update { it.copy(message = "Importados ${draws.size} concursos de ${file.name}.") }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(message = "Falha ao importar ${file.name}: ${e.message ?: "arquivo inválido"}")
                }
            } finally {
                _uiState.update { it.copy(importing = false) }
                refreshHistory()
            }
        }
    }

    fun consumeMessage() {
        _uiState.update { it.copy(message = null) }
    }

    private fun refreshHistory() {
        scope.launch {
            val lottery = _uiState.value.lottery
            val count = repository.count(lottery)
            val latest = repository.getLatestDraw(lottery)
            _uiState.update { it.copy(historyCount = count, latestDraw = latest) }
        }
    }

    fun dispose() {
        scope.cancel()
    }
}

private val logger: Logger = Logger.getLogger(BacktestViewModel::class.java.name)
