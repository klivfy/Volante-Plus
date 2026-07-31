package com.volanteplus.desktop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.volanteplus.desktop.ui.backtest.BacktestScreen
import com.volanteplus.desktop.ui.backtest.BacktestViewModel
import com.volanteplus.desktop.ui.theme.VolantePlusTheme
import com.volanteplus.desktop.ui.volante.VolanteScreen
import com.volanteplus.desktop.ui.volante.VolanteViewModel
import com.volanteplus.loterias.data.repository.InMemoryDrawRepository
import com.volanteplus.loterias.domain.backtest.BacktestEngine

private enum class Destination(val label: String, val icon: ImageVector) {
    VOLANTE("Volante", Icons.Filled.Edit),
    BACKTEST("Backtesting", Icons.Filled.DateRange),
}

fun main() = application {
    val windowState = rememberWindowState(size = DpSize(900.dp, 700.dp))

    var destination by remember { mutableStateOf(Destination.VOLANTE) }

    // Repositório único compartilhado pelas duas telas — o desktop ainda não
    // tem persistência própria (ver docs/DESKTOP.md); "Importar CSV" na tela
    // de Backtesting é quem popula o histórico que as duas leem.
    val repository = remember { InMemoryDrawRepository() }
    val volanteViewModel = remember { VolanteViewModel(repository = repository) }
    val backtestViewModel = remember {
        BacktestViewModel(engine = BacktestEngine(repository), repository = repository)
    }

    DisposableEffect(Unit) {
        onDispose {
            volanteViewModel.dispose()
            backtestViewModel.dispose()
        }
    }

    Window(
        onCloseRequest = ::exitApplication,
        title = "Volante+",
        state = windowState,
        onPreviewKeyEvent = { event ->
            if (event.type != KeyEventType.KeyDown || !event.isCtrlPressed) return@Window false
            when (event.key) {
                // Ctrl+G: gera jogos com o lote atual (só faz sentido no Volante).
                Key.G -> {
                    if (destination == Destination.VOLANTE) {
                        volanteViewModel.generateGames(volanteViewModel.uiState.value.batchCount)
                    }
                    true
                }
                // Ctrl+B: vai para a tela de Backtesting.
                Key.B -> {
                    destination = Destination.BACKTEST
                    true
                }
                else -> false
            }
        },
    ) {
        VolantePlusTheme {
            MainScaffold(
                destination = destination,
                onDestinationChange = { destination = it },
                volanteViewModel = volanteViewModel,
                backtestViewModel = backtestViewModel,
            )
        }
    }
}

@Composable
private fun MainScaffold(
    destination: Destination,
    onDestinationChange: (Destination) -> Unit,
    volanteViewModel: VolanteViewModel,
    backtestViewModel: BacktestViewModel,
) {
    Scaffold(
        bottomBar = {
            NavigationBar {
                Destination.entries.forEach { item ->
                    NavigationBarItem(
                        selected = destination == item,
                        onClick = { onDestinationChange(item) },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (destination) {
                Destination.VOLANTE -> VolanteScreen(volanteViewModel)
                Destination.BACKTEST -> BacktestScreen(
                    viewModel = backtestViewModel,
                    onNavigateToVolante = { onDestinationChange(Destination.VOLANTE) },
                )
            }
        }
    }
}
