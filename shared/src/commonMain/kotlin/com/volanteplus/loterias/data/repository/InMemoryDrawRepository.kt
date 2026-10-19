package com.volanteplus.loterias.data.repository

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap

/**
 * Implementação em memória do repositório — usada em testes de domínio e,
 * a partir do módulo `:desktop`, como repositório real (desktop ainda não
 * tem persistência própria: o histórico entra por importação manual de CSV,
 * via [com.volanteplus.loterias.data.seed.CsvDrawParser], e não sobrevive a
 * fechar o app — ver docs/DESKTOP.md).
 */
class InMemoryDrawRepository : DrawRepository {

    // WHY ConcurrentHashMap: no desktop este repositório é compartilhado por
    // dois CoroutineScope(Dispatchers.Default) independentes — a importação de
    // CSV escreve enquanto a análise do volante lê. Com um mutableMapOf comum,
    // isso é uma corrida de dados real (ConcurrentModificationException na
    // varredura ou escrita perdida), não uma possibilidade teórica.
    private val stored = ConcurrentHashMap<Pair<Lottery, Int>, Draw>()

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
