package com.volanteplus.desktop.ui.backtest

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.TooltipArea
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.volanteplus.loterias.domain.backtest.BacktestReport
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import java.awt.FileDialog
import java.awt.Frame
import java.io.File
import java.util.Locale

/**
 * Adaptação desktop de `ui/backtest/BacktestScreen.kt` (Android). A diferença
 * de fundo: onde o Android tem "Sincronizar histórico" (API da Caixa +
 * seed de assets), o desktop tem "Importar CSV" — abre um seletor de
 * arquivo nativo (`java.awt.FileDialog`) e importa pelo mesmo parser/formato
 * do seed do Android (ver `docs/DESKTOP.md`).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun BacktestScreen(
    viewModel: BacktestViewModel,
    onNavigateToVolante: () -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // Sair da aba de Backtesting interrompe o cálculo em andamento.
    DisposableEffect(viewModel) {
        onDispose { viewModel.cancelBacktest() }
    }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Backtesting") }) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                PrimaryTabRow(selectedTabIndex = state.lottery.ordinal) {
                    Lottery.entries.forEach { lottery ->
                        Tab(
                            selected = lottery == state.lottery,
                            onClick = { viewModel.selectLottery(lottery) },
                            text = { Text(lottery.displayName) },
                        )
                    }
                }
            }

            item {
                HistoryCard(
                    state = state,
                    onImport = { file -> viewModel.importCsv(file) },
                )
            }

            item {
                ConfigSection(
                    state = state,
                    onSelectTrevoStrategy = viewModel::selectTrevoStrategy,
                    onSetGamesPerContest = viewModel::setGamesPerContest,
                    onSetCutoff = viewModel::setCutoffInput,
                )
            }

            item {
                Button(
                    onClick = viewModel::runBacktest,
                    enabled = state.canRun,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.running) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Executar backtest")
                    }
                }
            }

            state.report?.let { report ->
                item { ReportSection(report) }
            }

            if (state.report != null) {
                item {
                    TooltipArea(
                        tooltip = {
                            Surface(shape = RoundedCornerShape(4.dp), shadowElevation = 4.dp) {
                                Text(
                                    text = "Leva o desempenho medido neste backtest para o " +
                                        "gerador do Volante, no lugar da análise local.",
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(8.dp).width(240.dp),
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        FilledTonalButton(
                            onClick = {
                                viewModel.useReportForGeneration()
                                onNavigateToVolante()
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Usar estes dados para gerar jogos")
                        }
                    }
                }
            }
        }
    }
}

/** Diálogo nativo AWT de "abrir arquivo" — bloqueia a thread até fechar; roda fora da UI compose. */
private fun pickCsvFile(): File? {
    val dialog = FileDialog(null as Frame?, "Importar histórico (CSV)", FileDialog.LOAD)
    dialog.setFilenameFilter { _, name -> name.endsWith(".csv") }
    dialog.isVisible = true
    val directory = dialog.directory ?: return null
    val file = dialog.file ?: return null
    return File(directory, file)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HistoryCard(state: BacktestUiState, onImport: (File) -> Unit) {
    ElevatedCard(elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Histórico local", style = MaterialTheme.typography.titleSmall)
            val latest = state.latestDraw
            Text(
                text = if (state.historyCount == 0) {
                    "Nenhum concurso importado."
                } else {
                    "${state.historyCount} concursos — último: nº ${latest?.contestNumber} em ${latest?.date}"
                },
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 8.dp),
            ) {
                TooltipArea(
                    tooltip = {
                        Surface(shape = RoundedCornerShape(4.dp), shadowElevation = 4.dp) {
                            Text(
                                text = "Mesmo formato do seed do Android — ver CSVs de exemplo " +
                                    "em app/src/main/assets/seed/",
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(8.dp).width(240.dp),
                            )
                        }
                    },
                ) {
                    OutlinedButton(
                        onClick = { pickCsvFile()?.let(onImport) },
                        enabled = !state.importing,
                    ) {
                        Text(if (state.importing) "Importando…" else "Importar CSV")
                    }
                }
            }
        }
    }
}

@Composable
private fun ConfigSection(
    state: BacktestUiState,
    onSelectTrevoStrategy: (TrevoStrategy) -> Unit,
    onSetGamesPerContest: (Int) -> Unit,
    onSetCutoff: (String) -> Unit,
) {
    Column {
        Text("Método sob teste", style = MaterialTheme.typography.titleSmall)
        Text(
            text = "${GameBatch.STRATEGY_LABEL}: o desempenho das dezenas é medido apenas na " +
                "janela de treino e validado contra os concursos posteriores ao corte.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (state.lottery.hasTrevos) {
            Text(
                text = "Trevos",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(top = 12.dp),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TrevoStrategy.entries.forEach { option ->
                    FilterChip(
                        selected = option == state.trevoStrategy,
                        onClick = { onSelectTrevoStrategy(option) },
                        label = { Text(option.displayName) },
                    )
                }
            }
        }

        Text(
            text = "Jogos por concurso",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = 12.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(2, 3, 5).forEach { count ->
                FilterChip(
                    selected = state.gamesPerContest == count,
                    onClick = { onSetGamesPerContest(count) },
                    label = { Text("$count") },
                )
            }
        }

        OutlinedTextField(
            value = state.cutoffInput,
            onValueChange = onSetCutoff,
            label = { Text("Data de corte (aaaa-mm-dd)") },
            placeholder = { Text("2024-06-30") },
            isError = state.cutoffError,
            supportingText = {
                Text(
                    if (state.cutoffError) {
                        "Data inválida — use o formato aaaa-mm-dd"
                    } else {
                        "Concursos até esta data ficam na janela de treino; o restante valida."
                    }
                )
            },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        )
    }
}

@Composable
private fun ReportSection(report: BacktestReport) {
    ElevatedCard(elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Relatório", style = MaterialTheme.typography.titleMedium)

            ReportRow(
                "Concursos",
                "treino ${report.trainingDraws} · validação ${report.validationDraws}",
            )
            ReportRow("Jogos / apostas", "${report.totalGames} / ${report.totalBets}")
            ReportRow(
                "Média de acertos",
                "${report.stats.mean.fmt(3)} (esperado: ${report.expectedMeanHits.fmt(2)})",
            )
            ReportRow("Variância", report.stats.variance.fmt(3))
            ReportRow("Desvio padrão", report.stats.stdDeviation.fmt(3))
            ReportRow(
                "Taxa de eficácia",
                "${(report.prizeRate * 100).fmt(3)}% (${report.prizeCount} apostas premiadas)",
            )

            Text(
                text = "Distribuição de acertos",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
            )
            val maxCount = report.hitDistribution.values.maxOrNull() ?: 1
            (0..report.config.lottery.numbersDrawn).forEach { hits ->
                val count = report.hitDistribution[hits] ?: 0
                DistributionRow(hits, count, maxCount)
            }
        }
    }
}

@Composable
private fun ReportRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun DistributionRow(hits: Int, count: Int, maxCount: Int) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    ) {
        Text(
            text = "$hits",
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.width(16.dp),
        )
        Box(
            modifier = Modifier
                .padding(horizontal = 8.dp)
                .weight(1f)
                .height(16.dp)
                .background(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.small,
                ),
        ) {
            if (count > 0) {
                Box(
                    modifier = Modifier
                        .height(16.dp)
                        .fillMaxWidth(count / maxCount.toFloat())
                        .background(
                            color = MaterialTheme.colorScheme.primary,
                            shape = MaterialTheme.shapes.small,
                        ),
                )
            }
        }
        Text(
            text = "$count",
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.width(48.dp),
        )
    }
}

private fun Double.fmt(decimals: Int): String =
    String.format(Locale.US, "%.${decimals}f", this)
