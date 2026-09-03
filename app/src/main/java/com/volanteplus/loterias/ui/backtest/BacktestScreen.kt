package com.volanteplus.loterias.ui.backtest

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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.volanteplus.loterias.domain.backtest.BacktestReport
import com.volanteplus.loterias.domain.backtest.Verdict
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BacktestScreen(
    viewModel: BacktestViewModel = viewModel(factory = BacktestViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

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
                    onSync = viewModel::syncHistory,
                )
            }

            item {
                ConfigSection(
                    state = state,
                    onSelectStrategy = viewModel::selectStrategy,
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
        }
    }
}

@Composable
private fun HistoryCard(state: BacktestUiState, onSync: () -> Unit) {
    Card {
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
                OutlinedButton(onClick = onSync, enabled = !state.syncing) {
                    Text(if (state.syncing) "Sincronizando…" else "Sincronizar histórico")
                }
                state.syncProgress?.let { (done, total) ->
                    Text(
                        text = "$done / $total",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ConfigSection(
    state: BacktestUiState,
    onSelectStrategy: (GenerationStrategy) -> Unit,
    onSelectTrevoStrategy: (TrevoStrategy) -> Unit,
    onSetGamesPerContest: (Int) -> Unit,
    onSetCutoff: (String) -> Unit,
) {
    Column {
        Text("Estratégia sob teste", style = MaterialTheme.typography.titleSmall)
        GenerationStrategy.entries.forEach { option ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .selectable(
                        selected = option == state.strategy,
                        role = Role.RadioButton,
                        onClick = { onSelectStrategy(option) },
                    ),
            ) {
                RadioButton(selected = option == state.strategy, onClick = null)
                Text(
                    text = option.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }

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
            listOf(1, 3, 5, 10).forEach { count ->
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
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        VerdictCard(report)

        Card {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Relatório", style = MaterialTheme.typography.titleMedium)

                ReportRow(
                    "Concursos",
                    "treino ${report.trainingDraws} · validação ${report.validationDraws}",
                )
                ReportRow("Jogos / apostas", "${report.totalGames} / ${report.totalBets}")

                val test = report.hypothesisTest.meanTest
                ReportRow(
                    "Média de acertos",
                    "${test.observedMean.fmt(3)} (teórica ${test.theoreticalMean.fmt(2)})",
                )
                ReportRow(
                    "IC 95% da média",
                    "[${test.confidenceInterval.lower.fmt(3)}, " +
                        "${test.confidenceInterval.upper.fmt(3)}]",
                )
                ReportRow("Erro padrão", test.standardError.fmt(4))
                ReportRow("Valor-p", test.pValue.fmt(4))
                ReportRow(
                    "Amostra independente",
                    "${test.sampleSize} concursos",
                )

                Text(
                    text = "Premiação",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(top = 12.dp),
                )
                val prize = report.prizeAnalysis
                ReportRow(
                    "Premiadas",
                    "${prize.prizeCount} de ${prize.totalBets} apostas",
                )
                ReportRow("Esperadas na teoria", prize.expectedPrizes.fmt(2))
                ReportRow(
                    "IC 95% (Wilson)",
                    "[${(prize.wilsonInterval.lower * 100).fmt(4)}%, " +
                        "${(prize.wilsonInterval.upper * 100).fmt(4)}%]",
                )
                if (prize.underpowered) {
                    Text(
                        text = "Eventos raros demais para estimar a taxa: uma taxa " +
                            "observada de zero aqui indica falta de dados, não " +
                            "desempenho da estratégia.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }

                Text(
                    text = "Distribuição de acertos",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(top = 12.dp, bottom = 2.dp),
                )
                Text(
                    text = "observado vs. esperado pela hipergeométrica",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                val maxCount = report.hitDistribution.values.maxOrNull() ?: 1
                (0..6).forEach { hits ->
                    val count = report.hitDistribution[hits] ?: 0
                    val expected =
                        (report.theoreticalDistribution[hits] ?: 0.0) * report.totalGames
                    DistributionRow(hits, count, expected, maxCount)
                }
            }
        }
    }
}

@Composable
private fun VerdictCard(report: BacktestReport) {
    val verdict = report.verdict
    val container = when (verdict) {
        Verdict.NAO_REFUTA_ALEATORIEDADE -> MaterialTheme.colorScheme.secondaryContainer
        Verdict.DESVIO_SIGNIFICATIVO -> MaterialTheme.colorScheme.errorContainer
        Verdict.AMOSTRA_INSUFICIENTE -> MaterialTheme.colorScheme.surfaceVariant
    }
    val content = when (verdict) {
        Verdict.NAO_REFUTA_ALEATORIEDADE -> MaterialTheme.colorScheme.onSecondaryContainer
        Verdict.DESVIO_SIGNIFICATIVO -> MaterialTheme.colorScheme.onErrorContainer
        Verdict.AMOSTRA_INSUFICIENTE -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(colors = CardDefaults.cardColors(containerColor = container)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = verdict.label,
                style = MaterialTheme.typography.titleMedium,
                color = content,
            )
            Text(
                text = verdict.explanation,
                style = MaterialTheme.typography.bodyMedium,
                color = content,
                modifier = Modifier.padding(top = 6.dp),
            )

            val test = report.hypothesisTest
            Text(
                text = "α = ${test.significanceLevel.fmt(4)}" +
                    if (test.comparisons > 1) {
                        " (Bonferroni para ${test.comparisons} comparações)"
                    } else {
                        ""
                    },
                style = MaterialTheme.typography.bodySmall,
                color = content,
                modifier = Modifier.padding(top = 8.dp),
            )
            Text(
                text = "Poder para efeito de ±0,10 acerto: " +
                    "${(test.meanTest.power * 100).fmt(1)}% · menor efeito " +
                    "detectável: ${test.meanTest.minimumDetectableEffect.fmt(3)}",
                style = MaterialTheme.typography.bodySmall,
                color = content,
                modifier = Modifier.padding(top = 2.dp),
            )
            if (test.meanTest.degenerateEstimator) {
                Text(
                    text = "O lote cobre todo o universo de dezenas, o que fixa a " +
                        "soma de acertos por concurso. A média perde poder de " +
                        "discriminação neste desenho.",
                    style = MaterialTheme.typography.bodySmall,
                    color = content,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun ReportRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
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
private fun DistributionRow(hits: Int, count: Int, expected: Double, maxCount: Int) {
    val scale = maxOf(maxCount.toFloat(), expected.toFloat(), 1f)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
    ) {
        Text(
            text = "$hits",
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.width(16.dp),
        )
        Column(
            modifier = Modifier.padding(horizontal = 8.dp).weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            DistributionBar(
                fraction = count / scale,
                color = MaterialTheme.colorScheme.primary,
            )
            DistributionBar(
                fraction = (expected / scale).toFloat(),
                color = MaterialTheme.colorScheme.tertiary,
            )
        }
        Text(
            text = "$count\n${expected.fmt(1)}",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.width(56.dp),
        )
    }
}

@Composable
private fun DistributionBar(fraction: Float, color: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(10.dp)
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(3.dp),
            ),
    ) {
        val safe = fraction.coerceIn(0f, 1f)
        if (safe > 0f) {
            Box(
                modifier = Modifier
                    .height(10.dp)
                    .fillMaxWidth(safe)
                    .background(color = color, shape = RoundedCornerShape(3.dp)),
            )
        }
    }
}

private fun Double.fmt(decimals: Int): String =
    String.format(Locale.US, "%.${decimals}f", this)
