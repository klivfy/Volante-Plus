package com.volanteplus.loterias.testutil

import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import java.time.LocalDate

/** Implementação em memória do repositório para testes de domínio. */
class InMemoryDrawRepository : DrawRepository {

    private val stored = mutableMapOf<Pair<Lottery, Int>, Draw>()

    fun drawsOf(lottery: Lottery): List<Draw> =
        stored.values.filter { it.lottery == lottery }.sortedBy { it.contestNumber }

    override fun observeDraws(lottery: Lottery): Flow<List<Draw>> = flowOf(drawsOf(lottery))

    override suspend fun getDrawsUpTo(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        drawsOf(lottery).filter { it.date <= cutoff }

    override suspend fun getDrawsAfter(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        drawsOf(lottery).filter { it.date > cutoff }

    override suspend fun getLatestDraw(lottery: Lottery): Draw? =
        drawsOf(lottery).lastOrNull()

    override suspend fun count(lottery: Lottery): Int = drawsOf(lottery).size

    override suspend fun upsertAll(draws: List<Draw>) {
        draws.forEach { stored[it.lottery to it.contestNumber] = it }
    }

    override suspend fun deleteAll(lottery: Lottery) {
        stored.keys.removeAll { it.first == lottery }
    }
}
