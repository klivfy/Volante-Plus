package com.volanteplus.loterias.data.repository

import com.volanteplus.loterias.data.local.DrawDao
import com.volanteplus.loterias.data.local.DrawEntity
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate

class RoomDrawRepository(private val dao: DrawDao) : DrawRepository {

    override fun observeDraws(lottery: Lottery): Flow<List<Draw>> =
        dao.observeAll(lottery).map { entities -> entities.map(DrawEntity::toDomain) }

    override suspend fun getDrawsUpTo(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        dao.getUpTo(lottery, cutoff.toEpochDay()).map(DrawEntity::toDomain)

    override suspend fun getDrawsAfter(lottery: Lottery, cutoff: LocalDate): List<Draw> =
        dao.getAfter(lottery, cutoff.toEpochDay()).map(DrawEntity::toDomain)

    override suspend fun getLatestDraw(lottery: Lottery): Draw? =
        dao.getLatest(lottery)?.toDomain()

    override suspend fun count(lottery: Lottery): Int = dao.count(lottery)

    override suspend fun upsertAll(draws: List<Draw>) =
        dao.upsertAll(draws.map(DrawEntity::fromDomain))

    override suspend fun deleteAll(lottery: Lottery) = dao.deleteAll(lottery)
}
