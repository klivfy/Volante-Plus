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

        item(span = { GridItemSpan(maxLineSpan) }) {
            GeneratorControls(
                batchCount = state.batchCount,
                isAnalyzing = isAnalyzing,
                fechamentoHint = if (state.gameMode == GameMode.FECHAMENTO) {
                    "Fechamento: os jogos usam apenas as dezenas marcadas no volante " +
                        "(mín. ${lottery.minSelection}). Cada dezena marcada entra em jogo " +
                        "antes de qualquer repetição."
                } else {
                    null
                },
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GeneratorControls(
    batchCount: Int,
    isAnalyzing: Boolean,
    fechamentoHint: String?,
    onSetCount: (Int) -> Unit,
    onGenerate: () -> Unit,
) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        HorizontalDivider()
        fechamentoHint?.let { hint ->
            Text(
                text = hint,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.tertiary,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
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
            text = GameBatch.STRATEGY_LABEL,
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            text = "Os jogos saem do desempenho medido no histórico local — não há " +
                "estratégia a escolher.",
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
