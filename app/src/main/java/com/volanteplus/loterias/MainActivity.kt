package com.volanteplus.loterias

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.volanteplus.loterias.ui.backtest.BacktestScreen
import com.volanteplus.loterias.ui.theme.VolantePlusTheme
import com.volanteplus.loterias.ui.volante.VolanteScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            VolantePlusTheme {
                MainScaffold()
            }
        }
    }
}

private enum class Destination(val label: String, val icon: ImageVector) {
    VOLANTE("Volante", Icons.Filled.Edit),
    BACKTEST("Backtesting", Icons.Filled.DateRange),
}

@Composable
private fun MainScaffold() {
    var destination by rememberSaveable { mutableStateOf(Destination.VOLANTE) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                Destination.entries.forEach { item ->
                    NavigationBarItem(
                        selected = destination == item,
                        onClick = { destination = item },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (destination) {
                Destination.VOLANTE -> VolanteScreen()
                Destination.BACKTEST -> BacktestScreen(
                    onNavigateToVolante = { destination = Destination.VOLANTE },
                )
            }
        }
    }
}
