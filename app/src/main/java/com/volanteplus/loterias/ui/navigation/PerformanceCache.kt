package com.volanteplus.loterias.ui.navigation

import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.model.Lottery

/**
 * Ponte entre a tela de Backtesting e a tela de Volante: não há
 * NavController nesta fase (a navegação por abas do app é feita por estado
 * simples em `MainActivity`), então o resultado de um backtest atravessa
 * telas por este cache em memória, chaveado por loteria.
 */
object PerformanceCache {

    /** Desempenho de dezenas e trevos de um mesmo backtest. */
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
