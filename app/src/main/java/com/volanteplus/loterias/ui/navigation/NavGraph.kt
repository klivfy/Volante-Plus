package com.volanteplus.loterias.ui.navigation

import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NumberPerformance

/**
 * Ponte entre a tela de Backtesting e a tela de Volante: não há
 * NavController nesta fase (a navegação por abas do app é feita por estado
 * simples em `MainActivity`), então o resultado de um backtest atravessa
 * telas por este cache em memória, chaveado por loteria.
 */
object PerformanceCache {
    private val cache = mutableMapOf<Lottery, List<NumberPerformance>>()

    fun store(lottery: Lottery, performances: List<NumberPerformance>) {
        cache[lottery] = performances
    }

    fun get(lottery: Lottery): List<NumberPerformance>? = cache[lottery]

    fun clear() {
        cache.clear()
    }
}
