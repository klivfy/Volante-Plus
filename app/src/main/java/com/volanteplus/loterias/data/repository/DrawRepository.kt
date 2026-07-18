package com.volanteplus.loterias.data.repository

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate

/**
 * Acesso ao histórico de concursos. A separação treino/validação por data de
 * corte é o contrato que o motor de backtesting consome: nenhuma estratégia
 * pode enxergar resultados posteriores ao corte.
 */
interface DrawRepository {

    fun observeDraws(lottery: Lottery): Flow<List<Draw>>

    /** Concursos com data <= [cutoff] (janela de treino). */
    suspend fun getDrawsUpTo(lottery: Lottery, cutoff: LocalDate): List<Draw>

    /** Concursos com data > [cutoff] (janela de validação). */
    suspend fun getDrawsAfter(lottery: Lottery, cutoff: LocalDate): List<Draw>

    suspend fun getLatestDraw(lottery: Lottery): Draw?

    suspend fun count(lottery: Lottery): Int

    suspend fun upsertAll(draws: List<Draw>)

    suspend fun deleteAll(lottery: Lottery)
}
