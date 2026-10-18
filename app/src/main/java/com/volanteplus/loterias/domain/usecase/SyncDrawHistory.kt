package com.volanteplus.loterias.domain.usecase

import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

/**
 * Sincronização incremental do histórico: busca na API apenas os concursos
 * entre o último persistido localmente e o último publicado. As requisições
 * são feitas em janelas de concorrência limitada e persistidas em lotes para
 * que uma falha no meio do caminho não descarte o progresso — a próxima
 * sincronização retoma de onde parou.
 */
class SyncDrawHistory(
    private val repository: DrawRepository,
    private val api: CaixaLotteryApi,
) {

    data class Result(
        val imported: Int,
        val latestContest: Int?,
        /** false quando a sincronização parou antes de alcançar o último concurso. */
        val completed: Boolean,
    )

    suspend operator fun invoke(
        lottery: Lottery,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
    ): Result {
        val remoteLatest = api.fetchLatest(lottery)
        val localLatest = repository.getLatestDraw(lottery)?.contestNumber ?: 0
        val missing = (localLatest + 1)..remoteLatest.numero
        if (missing.isEmpty()) {
            return Result(imported = 0, latestContest = localLatest, completed = true)
        }

        val total = missing.count()
        var imported = 0
        val buffer = mutableListOf<Draw>()
        var failed = false

        // Busca em janelas de concorrência limitada: cada janela dispara até
        // MAX_CONCURRENT_FETCHES requisições em paralelo e espera todas antes
        // de persistir. A ordem dos concursos é preservada (e uma falha
        // interrompe no ponto certo, retomando dali na próxima execução) sem
        // custear N round-trips puramente sequenciais.
        val missingList = missing.toList()
        var index = 0
        while (index < missingList.size && !failed) {
            val end = minOf(index + MAX_CONCURRENT_FETCHES, missingList.size)
            val window = missingList.subList(index, end)
            val draws: List<Draw?> = coroutineScope {
                window.map { contest ->
                    async {
                        try {
                            if (contest == remoteLatest.numero) {
                                remoteLatest.toDomain(lottery)
                            } else {
                                api.fetchContest(lottery, contest).toDomain(lottery)
                            }
                        } catch (e: CancellationException) {
                            // Sem isto, cancelar a sincronização virava "concurso
                            // falhou" e o cancelamento estruturado se perdia.
                            throw e
                        } catch (_: Exception) {
                            null
                        }
                    }
                }.awaitAll()
            }

            for (draw in draws) {
                if (draw == null) {
                    failed = true
                    break
                }
                buffer += draw
                if (buffer.size >= BATCH_SIZE) {
                    repository.upsertAll(buffer.toList())
                    imported += buffer.size
                    buffer.clear()
                }
                onProgress(imported + buffer.size, total)
            }
            index = end
        }

        if (buffer.isNotEmpty()) {
            repository.upsertAll(buffer.toList())
            imported += buffer.size
        }

        return Result(
            imported = imported,
            latestContest = repository.getLatestDraw(lottery)?.contestNumber,
            completed = !failed,
        )
    }

    companion object {
        private const val BATCH_SIZE = 50

        /** Requisições disparadas ao mesmo tempo em cada janela de busca. */
        private const val MAX_CONCURRENT_FETCHES = 8
    }
}
