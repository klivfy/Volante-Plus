package com.volanteplus.desktop

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.TooltipArea
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Notification
import androidx.compose.ui.window.Tray
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberTrayState
import androidx.compose.ui.window.rememberWindowState
import com.volanteplus.desktop.notification.NextDrawNotifier
import com.volanteplus.desktop.prefs.DesktopPreferences
import com.volanteplus.desktop.theme.detectWindowsDarkTheme
import com.volanteplus.desktop.ui.backtest.BacktestScreen
import com.volanteplus.desktop.ui.backtest.BacktestViewModel
import com.volanteplus.desktop.ui.theme.VolantePlusTheme
import com.volanteplus.desktop.ui.volante.VolanteScreen
import com.volanteplus.desktop.ui.volante.VolanteViewModel
import com.volanteplus.loterias.data.remote.HttpCaixaLotteryApi
import com.volanteplus.loterias.data.repository.InMemoryDrawRepository
import com.volanteplus.loterias.domain.backtest.BacktestEngine
import com.volanteplus.loterias.domain.usecase.DetectNewContestUseCase
import com.volanteplus.loterias.domain.usecase.GetNextDrawInfoUseCase
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.awt.Dimension
import javax.imageio.ImageIO

private enum class Destination(val label: String, val icon: ImageVector) {
    VOLANTE("Volante", Icons.Filled.Edit),
    BACKTEST("Backtesting", Icons.Filled.DateRange),
}

/** Intervalo entre checagens de novo concurso — a Caixa não publica com mais frequência que isso. */
private const val NEXT_DRAW_CHECK_INTERVAL_MS = 30 * 60 * 1000L

fun main() = application {
    val prefs = remember { DesktopPreferences() }
    val windowState = rememberWindowState(
        size = DpSize(prefs.windowWidth.dp, prefs.windowHeight.dp),
    )
    var isWindowVisible by remember { mutableStateOf(true) }
    var destination by remember { mutableStateOf(Destination.VOLANTE) }

    // Repositório único compartilhado pelas duas telas — o desktop ainda não
    // tem persistência própria (ver docs/DESKTOP.md); "Importar CSV" na tela
    // de Backtesting é quem popula o histórico que as duas leem.
    val repository = remember { InMemoryDrawRepository() }
    val caixaApi = remember { HttpCaixaLotteryApi() }
    val getNextDrawInfo = remember { GetNextDrawInfoUseCase(caixaApi) }
    val volanteViewModel = remember {
        VolanteViewModel(
            repository = repository,
            getNextDrawInfo = getNextDrawInfo,
            initialLottery = prefs.lastLottery,
        )
    }
    val backtestViewModel = remember {
        BacktestViewModel(engine = BacktestEngine(repository), repository = repository)
    }

    val volanteState by volanteViewModel.uiState.collectAsState()
    LaunchedEffect(volanteState.lottery) { prefs.lastLottery = volanteState.lottery }

    DisposableEffect(Unit) {
        onDispose {
            volanteViewModel.dispose()
            backtestViewModel.dispose()
        }
    }

    // Tema: uma escolha explícita do usuário (persistida) vence; sem ela,
    // segue o tema do Windows (detectado uma vez, via registro — ver
    // com.volanteplus.desktop.theme.WindowsTheme); sem Windows por perto
    // (ex.: desenvolvimento local em outro SO), cai no isSystemInDarkTheme()
    // do próprio Compose.
    var darkThemeOverride by remember { mutableStateOf(prefs.darkThemeOverride) }
    val windowsDarkTheme = remember { detectWindowsDarkTheme() }

    val trayState = rememberTrayState()
    val trayIcon = remember { loadTrayIcon() }
    val notifier = remember {
        NextDrawNotifier(DetectNewContestUseCase(getNextDrawInfo), prefs)
    }

    LaunchedEffect(Unit) {
        while (isActive) {
            delay(NEXT_DRAW_CHECK_INTERVAL_MS)
            val updates = runCatching { notifier.checkAll() }.getOrNull().orEmpty()
            for (info in updates) {
                trayState.sendNotification(
                    Notification(
                        title = "Novo concurso — ${info.lottery.displayName}",
                        message = "Concurso ${info.contestNumber} sorteia em " +
                            "${info.drawDate.toLocalDate()}.",
                        type = Notification.Type.Info,
                    )
                )
            }
        }
    }

    Tray(
        icon = trayIcon,
        state = trayState,
        tooltip = "Volante+",
        onAction = { isWindowVisible = true },
        menu = {
            Item("Abrir", onClick = { isWindowVisible = true })
            Item("Ver próximo concurso", onClick = {
                isWindowVisible = true
                destination = Destination.VOLANTE
            })
            Separator()
            Item("Sair", onClick = ::exitApplication)
        },
    )

    Window(
        onCloseRequest = { isWindowVisible = false },
        visible = isWindowVisible,
        title = "Volante+",
        state = windowState,
        onPreviewKeyEvent = { event ->
            if (event.type != KeyEventType.KeyDown) return@Window false
            when {
                event.isCtrlPressed && event.key == Key.G -> {
                    // Ctrl+G: gera jogos com o lote atual (só faz sentido no Volante).
                    if (destination == Destination.VOLANTE) {
                        volanteViewModel.generateGames(volanteViewModel.uiState.value.batchCount)
                    }
                    true
                }
                event.isCtrlPressed && event.key == Key.B -> {
                    // Ctrl+B: vai para a tela de Backtesting.
                    destination = Destination.BACKTEST
                    true
                }
                event.key == Key.F11 -> {
                    windowState.placement = if (windowState.placement == WindowPlacement.Fullscreen) {
                        WindowPlacement.Floating
                    } else {
                        WindowPlacement.Fullscreen
                    }
                    true
                }
                else -> false
            }
        },
    ) {
        LaunchedEffect(Unit) { window.minimumSize = Dimension(600, 400) }

        LaunchedEffect(windowState.size) {
            prefs.windowWidth = windowState.size.width.value
            prefs.windowHeight = windowState.size.height.value
        }

        val fallbackSystemDark = isSystemInDarkTheme()
        val effectiveDark = darkThemeOverride ?: windowsDarkTheme ?: fallbackSystemDark

        VolantePlusTheme(darkTheme = effectiveDark) {
            MainScaffold(
                destination = destination,
                onDestinationChange = { destination = it },
                volanteViewModel = volanteViewModel,
                backtestViewModel = backtestViewModel,
                isDarkTheme = effectiveDark,
                onToggleTheme = {
                    val newValue = !effectiveDark
                    darkThemeOverride = newValue
                    prefs.darkThemeOverride = newValue
                },
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
    isDarkTheme: Boolean,
    onToggleTheme: () -> Unit,
) {
    Scaffold(
        topBar = { ThemeToggleBar(isDarkTheme = isDarkTheme, onToggle = onToggleTheme) },
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ThemeToggleBar(isDarkTheme: Boolean, onToggle: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            TooltipArea(
                tooltip = {
                    Surface(shape = RoundedCornerShape(4.dp), shadowElevation = 4.dp) {
                        Text(
                            text = if (isDarkTheme) "Usar tema claro" else "Usar tema escuro",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(8.dp),
                        )
                    }
                },
            ) {
                IconButton(onClick = onToggle) {
                    Icon(
                        imageVector = if (isDarkTheme) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                        contentDescription = "Alternar tema",
                    )
                }
            }
        }
    }
}

/**
 * Carrega o ícone da bandeja a partir de `resources/tray_icon.png` (PNG
 * pequeno gerado à parte do `.ico` do instalador — `ImageIO` não decodifica
 * ICO sem um plugin adicional, e o Compose Desktop pede um [Painter], não um
 * caminho de arquivo).
 */
private fun loadTrayIcon() =
    requireNotNull(object {}.javaClass.getResourceAsStream("/tray_icon.png")) {
        "tray_icon.png não encontrado nos recursos do módulo :desktop"
    }.use { stream -> BitmapPainter(requireNotNull(ImageIO.read(stream)).toComposeImageBitmap()) }
