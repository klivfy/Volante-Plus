package com.volanteplus.loterias.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.Flow

@Dao
interface DrawDao {

    @Upsert
    suspend fun upsertAll(draws: List<DrawEntity>)

    @Query("SELECT * FROM draws WHERE lottery = :lottery ORDER BY contestNumber")
    fun observeAll(lottery: Lottery): Flow<List<DrawEntity>>

    /** Resultados até a data de corte (inclusive) — janela de "treino" do backtesting. */
    @Query(
        "SELECT * FROM draws WHERE lottery = :lottery AND dateEpochDay <= :cutoffEpochDay " +
            "ORDER BY contestNumber"
    )
    suspend fun getUpTo(lottery: Lottery, cutoffEpochDay: Long): List<DrawEntity>

    /** Resultados após a data de corte — janela de validação do backtesting. */
    @Query(
        "SELECT * FROM draws WHERE lottery = :lottery AND dateEpochDay > :cutoffEpochDay " +
            "ORDER BY contestNumber"
    )
    suspend fun getAfter(lottery: Lottery, cutoffEpochDay: Long): List<DrawEntity>

    @Query("SELECT * FROM draws WHERE lottery = :lottery ORDER BY contestNumber DESC LIMIT 1")
    suspend fun getLatest(lottery: Lottery): DrawEntity?

    @Query("SELECT COUNT(*) FROM draws WHERE lottery = :lottery")
    suspend fun count(lottery: Lottery): Int

    @Query("DELETE FROM draws WHERE lottery = :lottery")
    suspend fun deleteAll(lottery: Lottery)
}
