package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery

/**
 * Faixas oficiais de premiação.
 *
 * ## Mega-Sena — 3 faixas
 * Sena (6), quina (5) e quadra (4). Trevos não se aplicam.
 *
 * ## +Milionária — 10 faixas
 * Cada faixa é um par (acertos de dezenas, acertos de trevos). Atenção às
 * faixas 2, 4 e 6: o regulamento diz **"1 ou nenhum trevo"**, ou seja, elas
 * também premiam com 0 trevos. E as faixas 8 e 10 exigem exatamente 1 trevo.
 *
 * | Faixa | Dezenas | Trevos   |
 * |-------|---------|----------|
 * | 1     | 6       | 2        |
 * | 2     | 6       | 1 ou 0   |
 * | 3     | 5       | 2        |
 * | 4     | 5       | 1 ou 0   |
 * | 5     | 4       | 2        |
 * | 6     | 4       | 1 ou 0   |
 * | 7     | 3       | 2        |
 * | 8     | 3       | 1        |
 * | 9     | 2       | 2        |
 * | 10    | 2       | 1        |
 *
 * ### Correção aplicada
 * A tabela anterior omitia as faixas **4+0**, **3+1** e **2+1**, tratando-as
 * como não premiadas. Como 2+1 sozinha vale 6,83% de probabilidade, o erro
 * subestimava a chance de prêmio da +Milionária em **88,4%** — o app dizia
 * "1 em 98" quando o correto é **1 em 11,4**. Um laboratório que existe para
 * refutar afirmações erradas sobre loteria não pode errar a própria tabela.
 */
object PrizeRules {

    /** As 10 faixas oficiais como (dezenas, conjunto de trevos que premia). */
    private val maisMilionariaFaixas: List<Pair<Int, Set<Int>>> = listOf(
        6 to setOf(2),      // faixa 1
        6 to setOf(1, 0),   // faixa 2
        5 to setOf(2),      // faixa 3
        5 to setOf(1, 0),   // faixa 4
        4 to setOf(2),      // faixa 5
        4 to setOf(1, 0),   // faixa 6
        3 to setOf(2),      // faixa 7
        3 to setOf(1),      // faixa 8
        2 to setOf(2),      // faixa 9
        2 to setOf(1),      // faixa 10
    )

    /** Pares (dezenas, trevos) premiados na +Milionária, já expandidos. */
    private val maisMilionariaPares: Set<Pair<Int, Int>> =
        maisMilionariaFaixas.flatMap { (dezenas, trevos) -> trevos.map { dezenas to it } }.toSet()

    fun isPrize(lottery: Lottery, numberHits: Int, trevoHits: Int): Boolean = when (lottery) {
        Lottery.MEGA_SENA -> numberHits >= 4
        Lottery.MAIS_MILIONARIA -> (numberHits to trevoHits) in maisMilionariaPares
    }

    /**
     * Índice da faixa (1 = a mais alta) ou null se a aposta não foi premiada.
     * Usado por [PrizeTable] para ponderar cada faixa pelo seu rateio.
     */
    fun tierIndex(lottery: Lottery, numberHits: Int, trevoHits: Int): Int? = when (lottery) {
        Lottery.MEGA_SENA -> when (numberHits) {
            6 -> 1
            5 -> 2
            4 -> 3
            else -> null
        }

        Lottery.MAIS_MILIONARIA -> maisMilionariaFaixas
            .indexOfFirst { (dezenas, trevos) -> dezenas == numberHits && trevoHits in trevos }
            .takeIf { it >= 0 }
            ?.plus(1)
    }

    /** Quantidade de faixas da loteria: 3 na Mega-Sena, 10 na +Milionária. */
    fun tierCount(lottery: Lottery): Int = when (lottery) {
        Lottery.MEGA_SENA -> 3
        Lottery.MAIS_MILIONARIA -> maisMilionariaFaixas.size
    }
}
