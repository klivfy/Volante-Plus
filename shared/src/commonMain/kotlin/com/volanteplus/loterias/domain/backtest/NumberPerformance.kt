package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery

/**
 * Faixa de desempenho de uma dezena dentro do ranking da sua loteria.
 * Os cortes são percentis sobre o ranking de [NumberPerformance.weight]:
 * 40% em [TOP], 30% em [MID] e 30% em [LOW].
 */
enum class PerformanceTier {
    TOP,
    MID,
    LOW,
}

/**
 * Desempenho de uma dezena (ou de um trevo) na janela analisada pelo
 * [BacktestAnalyzer] — a única fonte de dados da geração de jogos.
 *
 * - [hitCount]: aparições reais da dezena nos concursos analisados.
 * - [simulatedHitRate]: taxa de acerto medida por mini-simulações de Monte
 *   Carlo (0..1), que injeta ruído amostral no ranking de propósito.
 * - [weight]: nota final normalizada (0..1, sendo 1,0 a melhor dezena da
 *   janela), usada como probabilidade relativa na seleção ponderada.
 */
data class NumberPerformance(
    val number: Int,
    val lottery: Lottery,
    val hitCount: Int,
    val simulatedHitRate: Double,
    val weight: Double,
    val tier: PerformanceTier,
)
