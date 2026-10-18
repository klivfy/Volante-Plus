package com.volanteplus.desktop.ui.volante

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.TooltipArea
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.volanteplus.loterias.domain.generator.ClosureGuarantee
import com.volanteplus.loterias.domain.generator.ClosureDesigner
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.GeneratedGame
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import com.volanteplus.loterias.domain.model.TrevoStrategy
import kotlin.math.roundToInt

/**
 * Adaptação desktop de `ui/volante/VolanteScreen.kt` (Android). Diferenças:
 * `collectAsState` em vez de `collectAsStateWithLifecycle` (não há
 * Activity/lifecycle aqui) e strings literais em vez de `stringResource`
 * (sem sistema de recursos Android).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VolanteScreen(viewModel: VolanteViewModel) {
    val state by viewModel.uiState.collectAsState()
    val isAnalyzing by viewModel.isAnalyzing.collectAsState()
    val nextDrawInfo by viewModel.nextDrawInfo.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(title = { Text("Volante+") })
                Text(
                    text = "Gerador estatístico para Mega-Sena e +Milionária. Sem palpite, sem número quente.",
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
            GameModeTabs(selected = state.gameMode, onSelect = viewModel::selectGameMode)
            VolanteContent(
                state = state,
                isAnalyzing = isAnalyzing,
                nextDrawInfo = nextDrawInfo,
                onToggleNumber = viewModel::toggleNumber,
                onToggleTrevo = viewModel::toggleTrevo,
                onSelectTrevoStrategy = viewModel::selectTrevoStrategy,
                onClear = viewModel::clearSelection,
                onSetBatchCount = viewModel::setBatchCount,
                onSelectGuarantee = viewModel::selectClosureGuarantee,
                onGenerate = { viewModel.generateGames(state.batchCount) },
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
    nextDrawInfo: NextDrawInfo?,
    onToggleNumber: (Int) -> Unit,
    onToggleTrevo: (Int) -> Unit,
    onSelectTrevoStrategy: (TrevoStrategy) -> Unit,
    onClear: () -> Unit,
    onSetBatchCount: (Int) -> Unit,
    onSelectGuarantee: (ClosureGuarantee) -> Unit,
    onGenerate: () -> Unit,
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
            NextDrawCard(nextDrawInfo, modifier = Modifier.padding(bottom = 8.dp))
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

        if (state.gameMode == GameMode.FECHAMENTO) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                ClosurePanel(state = state, onSelectGuarantee = onSelectGuarantee)
            }
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            GeneratorControls(
                batchCount = state.batchCount,
                isAnalyzing = isAnalyzing,
                onSetCount = onSetBatchCount,
                onGenerate = onGenerate,
            )
        }

        state.generatedBatch?.let { batch ->
            item(span = { GridItemSpan(maxLineSpan) }) {
                GeneratedBatchList(batch)
            }
        }
    }
}

/**
 * Painel do modo Fechamento (equivalente ao do Android). Mostra o contrato do
 * desdobramento antes de gerar: quantos jogos, qual garantia e quanto custa —
 * e deixa claro que a garantia é sobre a cobertura das dezenas marcadas, não
 * sobre ganhar.
 */
@Composable
private fun ClosurePanel(
    state: VolanteUiState,
    onSelectGuarantee: (ClosureGuarantee) -> Unit,
) {
    val marcadas = state.current.numbers.size
    val design = state.closureDesign

    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(
            text = "GARANTIA DO FECHAMENTO",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            ClosureGuarantee.entries.forEach { option ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.selectable(
                        selected = option == state.closureGuarantee,
                        onClick = { onSelectGuarantee(option) },
                        role = Role.RadioButton,
                    ),
                ) {
                    RadioButton(
                        selected = option == state.closureGuarantee,
                        onClick = { onSelectGuarantee(option) },
                    )
                    Text(text = option.label, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        when {
            state.lottery.hasTrevos -> Text(
                text = "Fechamento com garantia só vale para a Mega-Sena: na " +
                    "${state.lottery.displayName} as faixas também dependem dos " +
                    "trevos, então cobrir dezenas não garante prêmio.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 12.dp),
            )

            design == null -> {
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
            }

            else -> {
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
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GeneratorControls(
    batchCount: Int,
    isAnalyzing: Boolean,
    onSetCount: (Int) -> Unit,
    onGenerate: () -> Unit,
) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        HorizontalDivider()
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

        TooltipArea(
            tooltip = {
                Surface(shape = RoundedCornerShape(4.dp), shadowElevation = 4.dp) {
                    Text(
                        text = "Atalho: Ctrl+G",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(8.dp),
                    )
                }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) {
            Button(
                onClick = onGenerate,
                enabled = !isAnalyzing,
                modifier = Modifier.fillMaxWidth(),
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
                    Text("Gerar jogos (Ctrl+G)")
                }
            }
        }
    }
}

@Composable
private fun GeneratedBatchList(batch: GameBatch) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        val origin = batch.sourcePool?.let { " · Fechamento de ${it.size} dezenas" } ?: ""
        Text(
            text = "Jogos gerados (${batch.strategyLabel}$origin)",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        batch.games.forEachIndexed { index, game ->
            GeneratedGameRow(index + 1, game)
        }
    }
}

@Composable
private fun GeneratedGameRow(position: Int, game: GeneratedGame) {
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
            .clickable(role = Role.Checkbox, onClick = onClick),
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
                        .clickable(role = Role.Checkbox) { onToggleTrevo(trevo) },
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
