package com.volanteplus.loterias.ui.volante

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.volanteplus.loterias.VolanteApplication
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.backtest.AccumulatedReturn
import com.volanteplus.loterias.domain.backtest.BacktestAnalyzer
import com.volanteplus.loterias.domain.backtest.BacktestConfig
import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.backtest.PayoutShare
import com.volanteplus.loterias.domain.generator.ClosureDesign
import com.volanteplus.loterias.domain.generator.ClosureDesigner
import com.volanteplus.loterias.domain.generator.ClosureGuarantee
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.ContestOutlook
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.domain.usecase.GetNextDrawInfoUseCase
import com.volanteplus.loterias.ui.navigation.PerformanceCache
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicInteger

/**
 * Fonte do retrato financeiro do próximo concurso. Abstraída como função
 * para que o ViewModel possa ser testado sem rede e construído sem
 * dependências quando a informação não for necessária.
 */
typealias OutlookSource = suspend (Lottery) -> ContestOutlook

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
    /** Garantia pedida no modo Fechamento. */
    val closureGuarantee: ClosureGuarantee = ClosureGuarantee.QUADRA,
    val generatedBatch: GameBatch? = null,
    /** Mensagem transitória (ex.: limite de dezenas atingido). */
    val message: String? = null,
    /** Seleção preservada para a ação "Desfazer" após limpar o volante. */
    val undoableClear: VolanteSelection? = null,
    /** Retrato do próximo concurso da loteria ativa; null enquanto não carregado. */
    val outlook: ContestOutlook? = null,
    val outlookLoading: Boolean = false,
    /** Motivo pelo qual o retrato não está disponível (rede, API sem o campo). */
    val outlookError: String? = null,
) {
    /** Retorno esperado do próximo concurso; null sem retrato ou sem arrecadação. */
    val accumulatedEstimate: AccumulatedReturn.Estimate?
        get() = outlook?.takeIf { it.lottery == lottery }?.let(AccumulatedReturn::estimate)

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

/**
 * Não há mais escolha de estratégia no modo Jogos avulsos: todo lote nasce
 * do desempenho medido pelo [BacktestAnalyzer] sobre o histórico local. O
 * ViewModel mantém esse desempenho em [performances], recalculando-o a cada
 * troca de loteria. O modo Fechamento é a exceção: desdobra as dezenas
 * marcadas por [ClosureDesigner] (covering design com garantia matemática
 * verificada), não pelo desempenho.
 *
 * @param repository null nas instâncias sem app (testes, @Preview): a análise
 *   roda sobre histórico vazio e devolve pesos iguais — sorteio uniforme.
 * @param getNextDrawInfo null nas mesmas condições — [nextDrawInfo] fica nulo.
 * @param outlookSource null nas mesmas condições — [VolanteUiState.outlook]
 *   fica nulo e [refreshOutlook] não faz nada.
 * @param workDispatcher onde rodam análise e geração (CPU); os testes injetam
 *   um dispatcher de teste para tornar o resultado determinístico.
 */
class VolanteViewModel(
    private val generator: GameGenerator = GameGenerator(),
    private val analyzer: BacktestAnalyzer = BacktestAnalyzer(),
    private val repository: DrawRepository? = null,
    private val getNextDrawInfo: GetNextDrawInfoUseCase? = null,
    private val outlookSource: OutlookSource? = null,
    private val workDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VolanteUiState())
    val uiState: StateFlow<VolanteUiState> = _uiState.asStateFlow()

    private val _performances = MutableStateFlow<List<NumberPerformance>>(emptyList())

    /** Desempenho das dezenas da loteria ativa — única fonte da geração. */
    val performances: StateFlow<List<NumberPerformance>> = _performances.asStateFlow()

    private val _trevoPerformances = MutableStateFlow<List<NumberPerformance>>(emptyList())

    private val _isAnalyzing = MutableStateFlow(false)

    /** True enquanto o [BacktestAnalyzer] processa a loteria ativa. */
    val isAnalyzing: StateFlow<Boolean> = _isAnalyzing.asStateFlow()

    /**
     * WHY: a análise é assíncrona e o usuário pode trocar de loteria no meio
     * dela. Cada disparo recebe um número de geração; só o mais recente pode
     * publicar resultado ou desligar o indicador de progresso.
     */
    private val analysisGeneration = AtomicInteger(0)

    val nextDrawInfo: StateFlow<NextDrawInfo?> = uiState
        .map { it.lottery }
        .distinctUntilChanged()
        .flatMapLatest { lottery -> getNextDrawInfo?.invoke(lottery) ?: flowOf(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /**
     * Medida de rateio do lote exibido — a única grandeza deste app que a
     * escolha de dezenas realmente move (ver [PayoutShare]).
     *
     * WHY (derivado, não armazenado): é função pura do lote e da arrecadação.
     * Guardá-lo no [uiState] criaria um estado a invalidar em cada ponto que
     * zera `generatedBatch`, e bastaria esquecer um para a tela exibir a
     * medida de um lote que não existe mais. Derivando, isso é impossível — e
     * de brinde o painel aparece sozinho quando a arrecadação chega depois da
     * geração.
     *
     * Null sem lote ou sem arrecadação informada pela API: o efeito do rateio
     * depende de quantas apostas concorrem, e sem esse número exibir um ganho
     * seria inventá-lo.
     */
    val payoutAssessment: StateFlow<PayoutShare.BatchAssessment?> = uiState
        .map { it.generatedBatch to it.accumulatedEstimate?.tickets }
        .distinctUntilChanged()
        .mapLatest { (batch, tickets) ->
            if (batch == null || tickets == null) {
                null
            } else {
                // A régua de popularidade é uma varredura de Monte Carlo na
                // primeira consulta de cada loteria: nunca na thread principal.
                withContext(workDispatcher) { PayoutShare.evaluateBatch(batch, tickets) }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        refreshPerformances()
        refreshOutlook()
    }

    fun selectLottery(lottery: Lottery) {
        if (lottery == _uiState.value.lottery) return
        _uiState.update {
            it.copy(
                lottery = lottery,
                generatedBatch = null,
                message = null,
                undoableClear = null,
                outlook = null,
                outlookError = null,
            )
        }
        refreshPerformances()
        refreshOutlook()
    }

    /** Busca (ou rebusca) o acumulado do próximo concurso da loteria ativa. */
    fun refreshOutlook() {
        val source = outlookSource ?: return
        val lottery = _uiState.value.lottery
        viewModelScope.launch {
            _uiState.update { it.copy(outlookLoading = true, outlookError = null) }
            try {
                val outlook = source(lottery)
                _uiState.update { state ->
                    // A loteria pode ter mudado durante a requisição; nesse
                    // caso o resultado pertence a outra aba e é descartado.
                    if (state.lottery == lottery) {
                        state.copy(outlook = outlook, outlookLoading = false)
                    } else {
                        state
                    }
                }
            } catch (e: Exception) {
                _uiState.update { state ->
                    if (state.lottery == lottery) {
                        state.copy(
                            outlookLoading = false,
                            outlookError = e.message ?: "sem conexão com a Caixa",
                        )
                    } else {
                        state
                    }
                }
            }
        }
    }

    fun selectGameMode(mode: GameMode) {
        _uiState.update {
            it.copy(gameMode = mode, generatedBatch = null, message = null, undoableClear = null)
        }
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
            state.copy(undoableClear = state.current)
                .withSelection(VolanteSelection(trevoStrategy = state.current.trevoStrategy))
        }
    }

    /** Restaura a seleção descartada pelo "Limpar" (ação "Desfazer" da snackbar). */
    fun undoClear() {
        _uiState.update { state ->
            val previous = state.undoableClear
            if (previous != null) {
                state.copy(undoableClear = null).withSelection(previous)
            } else {
                state
            }
        }
    }

    /** Descarta a seleção preservada quando a snackbar expira sem ação. */
    fun dismissUndo() {
        _uiState.update { it.copy(undoableClear = null) }
    }

    /** Incremento de 1 jogo, travado no máximo suportado. */
    fun incrementBatchCount() {
        _uiState.update {
            it.copy(batchCount = (it.batchCount + 1).coerceAtMost(GameGenerator.MAX_GAMES))
        }
    }

    /** Slider "QUANTOS JOGOS" do controle de lote. */
    fun setBatchCount(count: Int) {
        _uiState.update {
            it.copy(batchCount = count.coerceIn(GameGenerator.MIN_GAMES, GameGenerator.MAX_GAMES))
        }
    }

    fun selectClosureGuarantee(guarantee: ClosureGuarantee) {
        _uiState.update { it.copy(closureGuarantee = guarantee, generatedBatch = null) }
    }

    /**
     * Gera [count] jogos. No modo Fechamento, [count] é ignorado: o número de
     * jogos vem do desdobramento por covering design ([ClosureDesigner]), que
     * sozinho garante a cobertura — a geração ponderada por desempenho não
     * garante nada sobre as dezenas marcadas.
     */
    fun generateGames(count: Int) {
        val state = _uiState.value
        if (state.gameMode == GameMode.FECHAMENTO) {
            generateClosure(state)
            return
        }

        val performances = _performances.value
        if (performances.isEmpty()) {
            _uiState.update {
                it.copy(message = "Analisando o histórico — tente novamente em instantes.")
            }
            return
        }

        viewModelScope.launch(workDispatcher) {
            try {
                val batch = generator.generate(
                    lottery = state.lottery,
                    count = count,
                    performances = performances,
                    trevoPerformances = _trevoPerformances.value,
                    trevoStrategy = state.current.trevoStrategy,
                    pool = null,
                )
                _uiState.update { it.copy(generatedBatch = batch, message = null) }
            } catch (e: IllegalArgumentException) {
                _uiState.update { it.copy(message = e.message) }
            }
        }
    }

    /**
     * Desdobra as dezenas marcadas por covering design, com garantia
     * matemática verificada (ver [ClosureDesigner]) — não pela geração
     * ponderada por desempenho, que não garante cobertura alguma.
     */
    private fun generateClosure(state: VolanteUiState) {
        // A garantia é sobre as 6 dezenas. Na +Milionária as faixas também
        // exigem trevos, então "quadra garantida" não se traduz em prêmio
        // garantido e o fechamento seria uma promessa falsa. Melhor recusar
        // do que prometer errado.
        if (state.lottery.hasTrevos) {
            _uiState.update {
                it.copy(
                    message = "Fechamento com garantia só vale para a Mega-Sena. Na " +
                        "${state.lottery.displayName} as faixas também dependem dos " +
                        "trevos, e acertar dezenas não garante prêmio."
                )
            }
            return
        }
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
        val design = ClosureDesigner.design(marked.size, state.closureGuarantee)
        if (design == null) {
            _uiState.update {
                it.copy(
                    message = "Não há fechamento com garantia de " +
                        "${state.closureGuarantee.label} para ${marked.size} dezenas. " +
                        "Marque de ${ClosureDesigner.SUPPORTED_POOL_SIZES.first} a " +
                        "${ClosureDesigner.SUPPORTED_POOL_SIZES.last} dezenas."
                )
            }
            return
        }
        _uiState.update {
            it.copy(
                generatedBatch = GameBatch(
                    lottery = state.lottery,
                    games = design.apply(marked.toList()),
                    sourcePool = marked.sorted(),
                ),
                message = null,
            )
        }
    }

    fun consumeMessage() {
        _uiState.update { it.copy(message = null) }
    }

    /**
     * Recarrega o desempenho da loteria ativa. Um backtest recém-executado
     * (via `PerformanceCache`) tem prioridade sobre a análise local: ele foi
     * validado contra concursos reais e o usuário pediu explicitamente para
     * usá-lo.
     */
    private fun refreshPerformances() {
        val lottery = _uiState.value.lottery
        val generation = analysisGeneration.incrementAndGet()

        PerformanceCache.get(lottery)?.let { snapshot ->
            _performances.value = snapshot.numbers
            _trevoPerformances.value = snapshot.trevos
            _isAnalyzing.value = false
            return
        }

        viewModelScope.launch(workDispatcher) {
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

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[APPLICATION_KEY] as VolanteApplication
                VolanteViewModel(
                    repository = app.drawRepository,
                    getNextDrawInfo = app.getNextDrawInfo,
                    outlookSource = { lottery -> app.fetchContestOutlook(lottery) },
                )
            }
        }
    }
}
