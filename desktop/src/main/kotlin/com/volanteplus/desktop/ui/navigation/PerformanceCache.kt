package com.volanteplus.desktop.ui.navigation

import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Ponte entre a tela de Backtesting e a tela de Volante: mesmo papel do
 * equivalente Android (ui/navigation/PerformanceCache.kt) — cache em
 * memória chaveado por loteria, sem NavController.
 */
object PerformanceCache {

    data class Snapshot(
        val numbers: List<NumberPerformance>,
        val trevos: List<NumberPerformance> = emptyList(),
    )

    private val _snapshots = MutableStateFlow<Map<Lottery, Snapshot>>(emptyMap())

    /**
     * Observável: o Volante sobrevive à troca de aba, então precisa saber
     * quando um backtest novo é exportado em vez de ler o cache só ao abrir.
     */
    val snapshots: StateFlow<Map<Lottery, Snapshot>> = _snapshots.asStateFlow()

    fun store(lottery: Lottery, snapshot: Snapshot) {
        _snapshots.update { it + (lottery to snapshot) }
    }

    fun get(lottery: Lottery): Snapshot? = _snapshots.value[lottery]

    fun clear() {
        _snapshots.value = emptyMap()
    }
}
