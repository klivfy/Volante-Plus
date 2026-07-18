package com.volanteplus.loterias.data.local

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class DrawDaoTest {

    private lateinit var database: VolanteDatabase
    private lateinit var dao: DrawDao

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            VolanteDatabase::class.java,
        ).build()
        dao = database.drawDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    private fun megaDraw(contest: Int, date: LocalDate) = DrawEntity.fromDomain(
        Draw(Lottery.MEGA_SENA, contest, date, listOf(1, 2, 3, 4, 5, contest + 10))
    )

    @Test
    fun corteDeData_separaTreinoEValidacao() = runTest {
        dao.upsertAll(
            listOf(
                megaDraw(1, LocalDate.of(2024, 1, 10)),
                megaDraw(2, LocalDate.of(2024, 2, 10)),
                megaDraw(3, LocalDate.of(2024, 3, 10)),
            )
        )
        val cutoff = LocalDate.of(2024, 2, 10).toEpochDay()

        assertEquals(listOf(1, 2), dao.getUpTo(Lottery.MEGA_SENA, cutoff).map { it.contestNumber })
        assertEquals(listOf(3), dao.getAfter(Lottery.MEGA_SENA, cutoff).map { it.contestNumber })
    }

    @Test
    fun upsert_atualizaConcursoExistente() = runTest {
        dao.upsertAll(listOf(megaDraw(1, LocalDate.of(2024, 1, 10))))
        dao.upsertAll(listOf(megaDraw(1, LocalDate.of(2024, 1, 11))))

        assertEquals(1, dao.count(Lottery.MEGA_SENA))
        assertEquals(
            LocalDate.of(2024, 1, 11).toEpochDay(),
            dao.getLatest(Lottery.MEGA_SENA)?.dateEpochDay,
        )
    }

    @Test
    fun loterias_naoSeMisturam() = runTest {
        dao.upsertAll(listOf(megaDraw(1, LocalDate.of(2024, 1, 10))))
        dao.upsertAll(
            listOf(
                DrawEntity.fromDomain(
                    Draw(
                        Lottery.MAIS_MILIONARIA, 1, LocalDate.of(2024, 1, 10),
                        listOf(1, 2, 3, 4, 5, 6), listOf(1, 2),
                    )
                )
            )
        )

        assertEquals(1, dao.count(Lottery.MEGA_SENA))
        assertEquals(1, dao.count(Lottery.MAIS_MILIONARIA))
    }
}
