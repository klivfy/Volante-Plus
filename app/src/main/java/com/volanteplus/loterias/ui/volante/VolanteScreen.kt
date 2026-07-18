package com.volanteplus.loterias.ui.volante

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.volanteplus.loterias.R
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GameMode
import com.volanteplus.loterias.domain.model.GeneratedGame
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import com.volanteplus.loterias.ui.theme.VolantePlusTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VolanteScreen(viewModel: VolanteViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
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
            GameModeTabs(selected = state.gameMode, onSelect = viewModel::selectGameMode)
            VolanteContent(
                state = state,
                onToggleNumber = viewModel::toggleNumber,
                onToggleTrevo = viewModel::toggleTrevo,
                onSelectTrevoStrategy = viewModel::selectTrevoStrategy,
                onClear = viewModel::clearSelection,
                onIncrementBatchCount = viewModel::incrementBatchCount,
                onSetBatchCount = viewModel::setBatchCount,
                onSelectStrategy = viewModel::selectGenerationStrategy,
                onGenerate = viewModel::generateBatch,
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
    onToggleNumber: (Int) -> Unit,
    onToggleTrevo: (Int) -> Unit,
    onSelectTrevoStrategy: (TrevoStrategy) -> Unit,
    onClear: () -> Unit,
    onIncrementBatchCount: () -> Unit,
    onSetBatchCount: (Int) -> Unit,
    onSelectStrategy: (GenerationStrategy) -> Unit,
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
                strategy = state.generationStrategy,
                onIncrement = onIncrementBatchCount,
                onSetCount = onSetBatchCount,
                onSelectStrategy = onSelectStrategy,
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

@Composable
private fun GeneratorControls(
    batchCount: Int,
    strategy: GenerationStrategy,
    onIncrement: () -> Unit,
    onSetCount: (Int) -> Unit,
    onSelectStrategy: (GenerationStrategy) -> Unit,
    onGenerate: () -> Unit,
) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        HorizontalDivider()
        Text(
            text = "QUANTOS JOGOS",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(onClick = onIncrement) { Text("+1") }
            listOf(3, 5, 10).forEach { count ->
                FilterChip(
                    selected = batchCount == count,
                    onClick = { onSetCount(count) },
                    label = { Text("$count") },
                )
            }
            Text(
                text = "Lote: $batchCount",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(start = 8.dp),
            )
        }

        Text(
            text = "Estratégia",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = 16.dp),
        )
        GenerationStrategy.entries.forEach { option ->
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
                Column(modifier = Modifier.padding(start = 4.dp)) {
                    Text(option.displayName, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = option.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Button(
            onClick = onGenerate,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) {
            Text("Gerar lote")
        }
    }
}

@Composable
private fun GeneratedBatchList(batch: GameBatch) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(
            text = "Jogos gerados (${batch.strategy.displayName})",
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

@Preview(showBackground = true)
@Composable
private fun VolanteScreenPreview() {
    VolantePlusTheme {
        VolanteScreen()
    }
}
