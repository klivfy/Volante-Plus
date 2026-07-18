package com.volanteplus.loterias.domain.usecase

import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery

/**
 * Sincronização incremental do histórico: busca na API apenas os concursos
 * entre o último persistido localmente e o último publicado. Persiste em
 * lotes para que uma falha no meio do caminho não descarte o progresso —
 * a próxima sincronização retoma de onde parou.
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

        for (contest in missing) {
            val draw = try {
                if (contest == remoteLatest.numero) {
                    remoteLatest.toDomain(lottery)
                } else {
                    api.fetchContest(lottery, contest).toDomain(lottery)
                }
            } catch (_: Exception) {
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
    }
}
