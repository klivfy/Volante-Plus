package com.volanteplus.loterias.data.repository

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate
import java.util.TreeMap

/**
 * Implementação em memória do repositório — usada em testes de domínio e,
 * a partir do módulo `:desktop`, como repositório real (desktop ainda não
 * tem persistência própria: o histórico entra por importação manual de CSV,
 * via [com.volanteplus.loterias.data.seed.CsvDrawParser], e não sobrevive a
 * fechar o app — ver docs/DESKTOP.md).
 */
class InMemoryDrawRepository : DrawRepository {

    // WHY (Mutex + TreeMap por loteria): no desktop este é o repositório real,
    // lido pela análise/backtest em Dispatchers.Default enquanto a importação
    // de CSV escreve. Um mapa comum sem trava podia lançar
    // ConcurrentModificationException ou devolver leitura parcial. O TreeMap
    // mantém os concursos ordenados, então contagem e último concurso saem
    // sem filtrar e ordenar o histórico inteiro.
    private val mutex = Mutex()
    private val stored = mutableMapOf<Lottery, TreeMap<Int, Draw>>()

    /** Cópia ordenada por concurso; chamar com [mutex] travado. */
    private fun snapshotOf(lottery: Lottery): List<Draw> = stored[lottery]?.values?.toList().orEmpty()

    suspend fun drawsOf(lottery: Lottery): List<Draw> = mutex.withLock { snapshotOf(lottery) }

    override fun observeDraws(lottery: Lottery): Flow<List<Draw>> = flow { emit(drawsOf(lottery)) }

    override suspend fun getDrawsUpTo(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        mutex.withLock { snapshotOf(lottery).filter { it.date <= cutoff } }

    override suspend fun getDrawsAfter(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        mutex.withLock { snapshotOf(lottery).filter { it.date > cutoff } }

    override suspend fun getLatestDraw(lottery: Lottery): Draw? =
        mutex.withLock { stored[lottery]?.lastEntry()?.value }

    override suspend fun count(lottery: Lottery): Int = mutex.withLock { stored[lottery]?.size ?: 0 }

    override suspend fun upsertAll(draws: List<Draw>) {
        mutex.withLock {
            draws.forEach { stored.getOrPut(it.lottery) { TreeMap() }[it.contestNumber] = it }
        }
    }

    override suspend fun deleteAll(lottery: Lottery) {
        mutex.withLock { stored.remove(lottery) }
    }
}
