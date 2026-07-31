package com.volanteplus.loterias.domain.model

import java.time.LocalDate

/**
 * Resultado histórico de um concurso. Toda sorteio tem exatamente
 * [NUMBERS_DRAWN] dezenas; a +Milionária sorteia adicionalmente
 * [Lottery.TREVOS_REQUIRED] trevos.
 */
data class Draw(
    val lottery: Lottery,
    val contestNumber: Int,
    val date: LocalDate,
    val numbers: List<Int>,
    val trevos: List<Int> = emptyList(),
) {
    init {
        require(contestNumber > 0) { "Número de concurso inválido: $contestNumber" }
        require(numbers.size == NUMBERS_DRAWN) {
            "Concurso $contestNumber: esperadas $NUMBERS_DRAWN dezenas, recebidas ${numbers.size}"
        }
        require(numbers.toSet().size == numbers.size) {
            "Concurso $contestNumber: dezenas repetidas"
        }
        require(numbers.all { it in lottery.numberRange }) {
            "Concurso $contestNumber: dezena fora do intervalo ${lottery.numberRange}"
        }
        if (lottery.hasTrevos) {
            require(trevos.size == Lottery.TREVOS_REQUIRED) {
                "Concurso $contestNumber: esperados ${Lottery.TREVOS_REQUIRED} trevos"
            }
            require(trevos.toSet().size == trevos.size && trevos.all { it in Lottery.TREVO_RANGE }) {
                "Concurso $contestNumber: trevos inválidos $trevos"
            }
        } else {
            require(trevos.isEmpty()) {
                "Concurso $contestNumber: ${lottery.displayName} não possui trevos"
            }
        }
    }

    companion object {
        const val NUMBERS_DRAWN = 6
    }
}
