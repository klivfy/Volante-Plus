package com.volanteplus.loterias.ui.volante

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.volanteplus.loterias.R
import com.volanteplus.loterias.domain.backtest.AccumulatedReturn
import com.volanteplus.loterias.domain.backtest.PayoutShare
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.ContestOutlook
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.generator.ClosureDesigner
import com.volanteplus.loterias.domain.generator.ClosureGuarantee
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.GeneratedGame
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.ui.theme.VolantePlusTheme
import com.volanteplus.loterias.ui.volante.components.NextDrawCard
import kotlin.math.roundToInt
import java.text.NumberFormat
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VolanteScreen(viewModel: VolanteViewModel = viewModel(factory = VolanteViewModel.Factory)) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val nextDrawInfo by viewModel.nextDrawInfo.collectAsStateWithLifecycle()
    val isAnalyzing by viewModel.isAnalyzing.collectAsStateWithLifecycle()
    val payoutAssessment by viewModel.payoutAssessment.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    LaunchedEffect(state.undoableClear) {
        val snapshot = state.undoableClear ?: return@LaunchedEffect
        val result = snackbarHostState.showSnackbar(
            message = "Volante limpo",
            actionLabel = "Desfazer",
            duration = SnackbarDuration.Short,
        )
        when (result) {
            SnackbarResult.ActionPerformed -> viewModel.undoClear()
            SnackbarResult.Dismissed -> viewModel.dismissUndo()
        }
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(title = { Text(stringResource(R.string.app_name)) })
                // Slogan fixo exigido nas telas de geração.
                Text(
                    text = stringResource(R.string.slogan),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            LotteryTabs(selected = state.lottery, onSelect = viewModel::selectLottery)
            NextDrawCard(
                nextDrawInfo = nextDrawInfo,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            GameModeTabs(selected = state.gameMode, onSelect = viewModel::selectGameMode)
            VolanteContent(
                state = state,
                isAnalyzing = isAnalyzing,
                payoutAssessment = payoutAssessment,
                onToggleNumber = viewModel::toggleNumber,
                onToggleTrevo = viewModel::toggleTrevo,
                onSelectTrevoStrategy = viewModel::selectTrevoStrategy,
                onClear = viewModel::clearSelection,
                onSetBatchCount = viewModel::setBatchCount,
                onSelectGuarantee = viewModel::selectClosureGuarantee,
                onGenerate = { viewModel.generateGames(state.batchCount) },
                onRefreshOutlook = viewModel::refreshOutlook,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LotteryTabs(selected: Lottery, onSelect: (Lottery) -> Unit) {
    PrimaryTabRow(selectedTabIndex = selected.ordinal) {
        Lottery.entries.forEach { lottery ->
            Tab(
                selected = lottery == selected,
                onClick = { onSelect(lottery) },
                text = { Text(lottery.displayName) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GameModeTabs(selected: GameMode, onSelect: (GameMode) -> Unit) {
    SecondaryTabRow(selectedTabIndex = selected.ordinal) {
        GameMode.entries.forEach { mode ->
            Tab(
                selected = mode == selected,
                onClick = { onSelect(mode) },
                text = { Text(mode.displayName) },
            )
        }
    }
}

@Composable
private fun VolanteContent(
    state: VolanteUiState,
    isAnalyzing: Boolean,
    payoutAssessment: PayoutShare.BatchAssessment?,
    onToggleNumber: (Int) -> Unit,
    onToggleTrevo: (Int) -> Unit,
    onSelectTrevoStrategy: (TrevoStrategy) -> Unit,
    onClear: () -> Unit,
    onSetBatchCount: (Int) -> Unit,
    onSelectGuarantee: (ClosureGuarantee) -> Unit,
    onGenerate: () -> Unit,
    onRefreshOutlook: () -> Unit,
) {
    val lottery = state.lottery
    val selection = state.current

    LazyVerticalGrid(
        columns = GridCells.Fixed(NUMBER_GRID_COLUMNS),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            AccumulatedCard(
                outlook = state.outlook,
                estimate = state.accumulatedEstimate,
                loading = state.outlookLoading,
                error = state.outlookError,
                onRefresh = onRefreshOutlook,
            )
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            SelectionCounter(
                count = selection.numbers.size,
                min = lottery.minSelection,
                max = lottery.maxSelection,
            )
        }

        items(lottery.numberRange.toList(), key = { it }) { number ->
            NumberCell(
                number = number,
                selected = number in selection.numbers,
                onClick = { onToggleNumber(number) },
            )
        }

        if (lottery.hasTrevos) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                TrevoSection(
                    selectedTrevos = selection.trevos,
                    strategy = selection.trevoStrategy,
                    onToggleTrevo = onToggleTrevo,
                    onSelectStrategy = onSelectTrevoStrategy,
                )
            }
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (state.isSelectionValid) "Volante válido" else "Volante incompleto",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (state.isSelectionValid) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                OutlinedButton(onClick = onClear) { Text("Limpar") }
            }
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            GeneratorControls(
                state = state,
                isAnalyzing = isAnalyzing,
                onSetCount = onSetBatchCount,
                onSelectGuarantee = onSelectGuarantee,
                onGenerate = onGenerate,
            )
        }

        state.generatedBatch?.let { batch ->
            item(span = { GridItemSpan(maxLineSpan) }) {
                GeneratedBatchList(batch, payoutAssessment)
            }
        }
    }
}

@Composable
private fun GeneratorControls(
    state: VolanteUiState,
    isAnalyzing: Boolean,
    onSetCount: (Int) -> Unit,
    onSelectGuarantee: (ClosureGuarantee) -> Unit,
    onGenerate: () -> Unit,
) {
    val batchCount = state.batchCount
    val fechamento = state.gameMode == GameMode.FECHAMENTO

    Column(modifier = Modifier.padding(top = 16.dp)) {
        HorizontalDivider()

        if (fechamento) {
            ClosurePanel(state = state, onSelectGuarantee = onSelectGuarantee)
        } else {
            Text(
                text = "QUANTOS JOGOS",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
            )
            Slider(
                value = batchCount.toFloat(),
                onValueChange = { onSetCount(it.roundToInt()) },
                valueRange = GameGenerator.MIN_GAMES.toFloat()..GameGenerator.MAX_GAMES.toFloat(),
                steps = GameGenerator.MAX_GAMES - GameGenerator.MIN_GAMES - 1,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                for (count in GameGenerator.MIN_GAMES..GameGenerator.MAX_GAMES) {
                    Text(
                        text = "$count jogos",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (count == batchCount) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
            Text(
                text = "Mínimo ${GameGenerator.MIN_GAMES}, máximo ${GameGenerator.MAX_GAMES} " +
                    "jogos por análise estatística",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )

            Text(
                text = GameGenerator.UNPOPULAR_STRATEGY_LABEL,
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(top = 16.dp),
            )
            Text(
                text = "Sorteio uniforme com desempate pelos jogos menos disputados: " +
                    "a chance de acertar é exatamente a de qualquer outro jogo — e, " +
                    "se o jogo ganhar, o prêmio é dividido com menos gente.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        Button(
            onClick = onGenerate,
            enabled = !isAnalyzing,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) {
            if (isAnalyzing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                )
                Text(
                    text = "Analisando histórico…",
                    modifier = Modifier.padding(start = 8.dp),
                )
            } else {
                Text(if (fechamento) "Gerar fechamento" else "Gerar lote")
            }
        }
    }
}

/**
 * Cartão "Acumulado e retorno esperado". Mostra o único número deste app que
 * muda de concurso para concurso e é matematicamente legítimo: quanto o
 * acumulado eleva o retorno esperado de uma aposta simples. Ver
 * [AccumulatedReturn] para o modelo e suas limitações.
 */
@Composable
private fun AccumulatedCard(
    outlook: ContestOutlook?,
    estimate: AccumulatedReturn.Estimate?,
    loading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Card(
        colors = CardDefaults.cardColors(containerColor = colors.surfaceVariant),
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Paid,
                        contentDescription = null,
                        tint = colors.primary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = "Acumulado e retorno esperado",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    TextButton(onClick = onRefresh, contentPadding = PaddingValues(horizontal = 8.dp)) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Text("Atualizar", modifier = Modifier.padding(start = 4.dp))
                    }
                }
            }

            when {
                loading && outlook == null -> Text(
                    text = "Consultando a Caixa…",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )

                error != null && outlook == null -> Text(
                    text = "Não foi possível consultar o próximo concurso ($error).",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.error,
                    modifier = Modifier.padding(top = 12.dp),
                )

                outlook == null -> Text(
                    text = "Sem informação do próximo concurso.",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp),
                )

                else -> AccumulatedBody(outlook, estimate)
            }
        }
    }
}

@Composable
private fun AccumulatedStatRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun AccumulatedBody(outlook: ContestOutlook, estimate: AccumulatedReturn.Estimate?) {
    val colors = MaterialTheme.colorScheme
    val brl = remember { NumberFormat.getCurrencyInstance(Locale("pt", "BR")) }
    val date = outlook.nextDate?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    val contest = if (outlook.nextContest > 0) "Concurso ${outlook.nextContest}" else "Próximo concurso"

    Column(modifier = Modifier.padding(top = 12.dp)) {
        // Cabeçalho: qual concurso e o valor acumulado, lado a lado.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Column {
                Text(
                    text = listOfNotNull(contest, date).joinToString(" · "),
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.onSurfaceVariant,
                )
                Text(
                    text = if (outlook.accumulatedForNext > 0.0) {
                        brl.format(outlook.accumulatedForNext)
                    } else {
                        "Sem acumulado"
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        if (outlook.accumulatedForNext <= 0.0) {
            Text(
                text = "O prêmio principal sairá só da arrecadação deste concurso.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        if (estimate == null) {
            Text(
                text = "A Caixa não informou a arrecadação do último concurso; sem ela não dá " +
                    "para estimar o rateio.",
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
                modifier = Modifier.padding(top = 10.dp),
            )
            return@Column
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = colors.outline.copy(alpha = 0.3f))

        // Destaque: o retorno esperado por aposta, com chip de status.
        val pct = (estimate.returnRatio * 100).toInt()
        val statusContainer = if (estimate.isFavorable) colors.primaryContainer else colors.errorContainer
        val statusOn = if (estimate.isFavorable) colors.onPrimaryContainer else colors.onErrorContainer
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Retorno esperado por aposta de ${brl.format(estimate.betPrice)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                )
                Text(
                    text = brl.format(estimate.totalReturn),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(statusContainer)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    text = "$pct% do valor apostado",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = statusOn,
                )
            }
        }

        Row(modifier = Modifier.padding(top = 12.dp)) {
            AccumulatedStatRow(
                label = "Sem acumulado",
                value = brl.format(estimate.baseReturn),
                modifier = Modifier.weight(1f),
            )
        }
        Row(modifier = Modifier.padding(top = 4.dp)) {
            AccumulatedStatRow(
                label = "Bônus do acumulado",
                value = "+ ${brl.format(estimate.accumulatedBonus)}",
                modifier = Modifier.weight(1f),
            )
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = colors.outline.copy(alpha = 0.3f))

        // Progresso até o ponto de equilíbrio e até cobrir todas as combinações.
        val coveragePct = (estimate.coverageRatio * 100).toInt()
        Text(
            text = "$pct% do caminho até o equilíbrio — chega a 100% com acumulado de " +
                brl.format(estimate.breakEvenAccumulated),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
        )
        LinearProgressIndicator(
            progress = { estimate.returnRatio.toFloat().coerceIn(0f, 1f) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp)
                .clip(RoundedCornerShape(4.dp)),
            trackColor = colors.surface,
            color = if (estimate.isFavorable) colors.primary else colors.error,
        )

        Text(
            text = "Cobre $coveragePct% do custo de jogar todas as combinações " +
                "(${brl.format(estimate.fullCoverageCost)})",
            style = MaterialTheme.typography.bodySmall,
            color = colors.onSurfaceVariant,
            modifier = Modifier.padding(top = 10.dp),
        )
        LinearProgressIndicator(
            progress = { estimate.coverageRatio.toFloat().coerceIn(0f, 1f) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp)
                .clip(RoundedCornerShape(4.dp)),
            trackColor = colors.surface,
            color = colors.tertiary,
        )

        Text(
            text = "Isto muda quando vale mais apostar, nunca quais dezenas marcar. " +
                "Estimativa otimista: usa a arrecadação do concurso anterior, e " +
                "acumulado alto atrai mais apostas.",
            style = MaterialTheme.typography.bodySmall,
            color = colors.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

/**
 * Painel do modo Fechamento. Mostra o contrato do desdobramento antes de
 * gerar: quantos jogos, qual garantia e quanto custa — e deixa claro que a
 * garantia é sobre a cobertura das dezenas marcadas, não sobre ganhar.
 */
@Composable
private fun ClosurePanel(
    state: VolanteUiState,
    onSelectGuarantee: (ClosureGuarantee) -> Unit,
) {
    val marcadas = state.current.numbers.size
    val design = state.closureDesign

    Text(
        text = "GARANTIA DO FECHAMENTO",
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ClosureGuarantee.entries.forEach { option ->
            FilterChip(
                selected = option == state.closureGuarantee,
                onClick = { onSelectGuarantee(option) },
                label = { Text(option.label) },
            )
        }
    }

    if (state.lottery.hasTrevos) {
        Text(
            text = "Fechamento com garantia só vale para a Mega-Sena: na " +
                "${state.lottery.displayName} as faixas também dependem dos " +
                "trevos, então cobrir dezenas não garante prêmio.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(top = 12.dp),
        )
        return
    }

    if (design == null) {
        val min = ClosureDesigner.SUPPORTED_POOL_SIZES.first
        val max = ClosureDesigner.SUPPORTED_POOL_SIZES.last
        val guidance = if (marcadas < min) {
            "faltam ${min - marcadas} para a garantia mínima"
        } else {
            "o máximo suportado é $max dezenas"
        }
        Text(
            text = "Marque de $min a $max dezenas no volante para montar um " +
                "fechamento. Marcadas: $marcadas — $guidance.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )
        return
    }

    Text(
        text = design.contract,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.tertiary,
        modifier = Modifier.padding(top = 12.dp),
    )
    Text(
        text = "A garantia é no pior caso: qualquer combinação de " +
            "${state.closureGuarantee.hits} das suas $marcadas dezenas aparece " +
            "inteira em pelo menos um jogo. Ela não aumenta a chance por real " +
            "apostado — troca muitos resultados zerados por prêmios menores e " +
            "mais frequentes, apostando mais.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 6.dp),
    )
}

@Composable
private fun GeneratedBatchList(batch: GameBatch, payout: PayoutShare.BatchAssessment?) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        val origin = batch.sourcePool?.let { " · Fechamento de ${it.size} dezenas" } ?: ""
        Text(
            text = "Jogos gerados (${batch.strategyLabel}$origin)",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        batch.games.forEachIndexed { index, game ->
            GeneratedGameRow(index + 1, game, payout?.games?.getOrNull(index))
        }
        payout?.let { PayoutSharePanel(it) }
    }
}

/**
 * O único número desta tela que a escolha de dezenas realmente move.
 *
 * A chance de ganhar é idêntica para qualquer combinação e nenhum algoritmo a
 * altera — o app inteiro parte disso. O que varia é com quantas pessoas o
 * prêmio seria dividido, porque as pessoas não escolhem ao acaso. Por isso o
 * painel exibe a ressalva junto do número, nunca depois nem em outra tela: o
 * valor é real, mede outra coisa que não a chance, e as duas são fáceis de
 * confundir. Ver [PayoutShare] para a derivação.
 */
@Composable
private fun PayoutSharePanel(payout: PayoutShare.BatchAssessment) {
    val colors = MaterialTheme.colorScheme
    val gainPercent = payout.averageConditionalGain * 100
    val positive = gainPercent >= 0

    Card(
        colors = CardDefaults.cardColors(containerColor = colors.surfaceVariant),
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Groups,
                    contentDescription = null,
                    tint = colors.primary,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = "Rateio do prêmio",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }

            Text(
                text = "%+.1f%%".format(gainPercent),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = if (positive) colors.primary else colors.error,
                modifier = Modifier.padding(top = 8.dp),
            )
            Text(
                text = if (positive) {
                    "a mais de prêmio se ganhar, pela mesma chance de ganhar."
                } else {
                    "a menos de prêmio se ganhar, pela mesma chance de ganhar."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = colors.onSurfaceVariant,
            )

            AccumulatedStatRow(
                label = "Jogos menos disputados que a média",
                value = "${payout.betterThanAverageCount} de ${payout.games.size}",
                modifier = Modifier.padding(top = 12.dp),
            )
            AccumulatedStatRow(
                label = "Popularidade relativa média",
                value = "%.2f×".format(payout.averageRelativePopularity),
                modifier = Modifier.padding(top = 4.dp),
            )
            val integers = remember { NumberFormat.getIntegerInstance(Locale("pt", "BR")) }
            AccumulatedStatRow(
                label = "Apostas estimadas no concurso",
                value = integers.format(payout.tickets),
                modifier = Modifier.padding(top = 4.dp),
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            Text(
                text = payout.disclaimer,
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun GeneratedGameRow(
    position: Int,
    game: GeneratedGame,
    payout: PayoutShare.Assessment?,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    ) {
        Text(
            text = "Jogo %02d".format(position),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text(
                text = game.numbers.joinToString(" ") { "%02d".format(it) },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
            )
            if (game.trevoDuplas.isNotEmpty()) {
                val trevosLabel =
                    if (game.trevoDuplas.size == GameGenerator.allTrevoPairs.size) {
                        "Trevos: cobertura total (15 duplas)"
                    } else {
                        "Trevos: " + game.trevoDuplas.joinToString(" | ") { dupla ->
                            dupla.sorted().joinToString("-")
                        }
                    }
                Text(
                    text = trevosLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
            }
            payout?.let {
                Text(
                    text = it.summary,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (it.betterThanAverage) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

@Composable
private fun SelectionCounter(count: Int, min: Int, max: Int) {
    Text(
        text = "$count dezenas selecionadas — mínimo $min, máximo $max",
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(bottom = 4.dp),
    )
}

@Composable
private fun NumberCell(number: Int, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(44.dp)
            .border(
                border = BorderStroke(1.dp, if (selected) colors.primary else colors.outline),
                shape = CircleShape,
            )
            .background(
                color = if (selected) colors.primary else colors.surface,
                shape = CircleShape,
            )
            .toggleable(value = selected, role = Role.Checkbox, onValueChange = { onClick() }),
    ) {
        Text(
            text = "%02d".format(number),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) colors.onPrimary else colors.onSurface,
        )
    }
}

@Composable
private fun TrevoSection(
    selectedTrevos: Set<Int>,
    strategy: TrevoStrategy,
    onToggleTrevo: (Int) -> Unit,
    onSelectStrategy: (TrevoStrategy) -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(
            text = "Trevos — selecione exatamente ${Lottery.TREVOS_REQUIRED}",
            style = MaterialTheme.typography.titleSmall,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(vertical = 8.dp),
        ) {
            Lottery.TREVO_RANGE.forEach { trevo ->
                val selected = trevo in selectedTrevos
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(44.dp)
                        .border(
                            border = BorderStroke(
                                1.dp,
                                if (selected) colors.secondary else colors.outline,
                            ),
                            shape = CircleShape,
                        )
                        .background(
                            color = if (selected) colors.secondary else colors.surface,
                            shape = CircleShape,
                        )
                        .toggleable(
                            value = selected,
                            role = Role.Checkbox,
                            onValueChange = { onToggleTrevo(trevo) },
                        ),
                ) {
                    Text(
                        text = "$trevo",
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) colors.onSecondary else colors.onSurface,
                    )
                }
            }
        }

        TrevoStrategy.entries.forEach { option ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .selectable(
                        selected = option == strategy,
                        role = Role.RadioButton,
                        onClick = { onSelectStrategy(option) },
                    ),
            ) {
                RadioButton(selected = option == strategy, onClick = null)
                Text(
                    text = "${option.displayName} (${option.description})",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }
    }
}

private const val NUMBER_GRID_COLUMNS = 6

@Preview(showBackground = true)
@Composable
private fun VolanteScreenPreview() {
    VolantePlusTheme {
        VolanteScreen()
    }
}
