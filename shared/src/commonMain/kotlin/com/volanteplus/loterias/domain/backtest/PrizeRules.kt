package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery

/**
 * Faixas de premiação usadas para a taxa de eficácia.
 *
 * - Mega-Sena: quadra (4), quina (5) e sena (6); trevos não se aplicam.
 * - +Milionária: as 10 faixas oficiais como pares (acertos de dezenas,
 *   acertos de trevos): 6+2, 6+1, 6+0, 5+2, 5+1, 5+0, 4+2, 4+1, 3+2 e 2+2.
 */
object PrizeRules {

    private val maisMilionariaFaixas: Set<Pair<Int, Int>> = setOf(
        6 to 2, 6 to 1, 6 to 0,
        5 to 2, 5 to 1, 5 to 0,
        4 to 2, 4 to 1,
        3 to 2,
        2 to 2,
    )

    fun isPrize(lottery: Lottery, numberHits: Int, trevoHits: Int): Boolean = when (lottery) {
        Lottery.MEGA_SENA -> numberHits >= 4
        Lottery.MAIS_MILIONARIA -> (numberHits to trevoHits) in maisMilionariaFaixas
    }
}
