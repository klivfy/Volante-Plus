package com.volanteplus.loterias.domain.model

import com.volanteplus.loterias.domain.backtest.NumberPerformance

/**
 * Jogo gerado: [numbers] sempre ordenado; [trevoDuplas] vazio para loterias
 * sem trevos, 1 dupla no modo Econômico ou as 15 duplas na Cobertura total.
 */
data class GeneratedGame(
    val numbers: List<Int>,
    val trevoDuplas: List<Set<Int>> = emptyList(),
)

/**
 * Lote gerado. Não há estratégia selecionável pelo usuário: a padrão é o
 * sorteio uniforme com desempate pelos jogos menos disputados
 * ([GameGenerator.UNPOPULAR_STRATEGY_LABEL]); a estratégia legada por tiers
 * de frequência só roda no backtest/laboratório ([STRATEGY_LABEL]).
 * [strategyLabel] é rótulo de exibição do lote concreto.
 */
data class GameBatch(
    val lottery: Lottery,
    val games: List<GeneratedGame>,
    /** Desempenho que originou o lote, preservado para auditoria. */
    val performancesSnapshot: List<NumberPerformance> = emptyList(),
    /** Dezenas de origem no modo Fechamento; null quando o lote usa o volante inteiro. */
    val sourcePool: List<Int>? = null,
    val strategyLabel: String = STRATEGY_LABEL,
) {
    companion object {
        const val STRATEGY_LABEL = "Backtest-Driven"
    }
}
