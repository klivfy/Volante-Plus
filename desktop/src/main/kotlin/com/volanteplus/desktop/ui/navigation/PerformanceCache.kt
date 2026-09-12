package com.volanteplus.desktop.ui.navigation

import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.model.Lottery

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

    private val cache = mutableMapOf<Lottery, Snapshot>()

    fun store(lottery: Lottery, snapshot: Snapshot) {
        cache[lottery] = snapshot
    }

    fun get(lottery: Lottery): Snapshot? = cache[lottery]

    fun clear() {
        cache.clear()
    }
}
