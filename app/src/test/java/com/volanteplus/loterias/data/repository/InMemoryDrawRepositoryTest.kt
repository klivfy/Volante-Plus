package com.volanteplus.loterias.data.repository

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class InMemoryDrawRepositoryTest {

    private fun draw(lottery: Lottery, contest: Int) = Draw(
        lottery,
        contest,
        LocalDate.of(2000, 1, 1).plusDays(contest.toLong()),
        listOf(1, 2, 3, 4, 5, 6),
        trevos = if (lottery.hasTrevos) listOf(1, 2) else emptyList(),
    )

    @Test
    fun `mantem ordem por concurso e separa loterias`() = runTest {
        val repo = InMemoryDrawRepository()
        repo.upsertAll(listOf(draw(Lottery.MEGA_SENA, 3), draw(Lottery.MEGA_SENA, 1), draw(Lottery.MEGA_SENA, 2)))
        repo.upsertAll(listOf(draw(Lottery.MAIS_MILIONARIA, 9)))

        assertEquals(listOf(1, 2, 3), repo.drawsOf(Lottery.MEGA_SENA).map { it.contestNumber })
        assertEquals(3, repo.count(Lottery.MEGA_SENA))
        assertEquals(3, repo.getLatestDraw(Lottery.MEGA_SENA)?.contestNumber)
        assertEquals(1, repo.count(Lottery.MAIS_MILIONARIA))

        repo.deleteAll(Lottery.MEGA_SENA)
        assertEquals(0, repo.count(Lottery.MEGA_SENA))
        assertNull(repo.getLatestDraw(Lottery.MEGA_SENA))
        assertEquals(1, repo.count(Lottery.MAIS_MILIONARIA))
    }

    @Test
    fun `importacao concorrente com leituras nao perde concursos nem lanca excecao`() = runBlocking {
        val repo = InMemoryDrawRepository()
        val writers = (0 until 8).map { writer ->
            async(Dispatchers.Default) {
                for (i in 0 until 500) repo.upsertAll(listOf(draw(Lottery.MEGA_SENA, writer * 500 + i + 1)))
            }
        }
        val readers = (0 until 4).map {
            async(Dispatchers.Default) {
                repeat(500) {
                    repo.count(Lottery.MEGA_SENA)
                    repo.getDrawsUpTo(Lottery.MEGA_SENA, LocalDate.of(2005, 1, 1))
                    repo.getLatestDraw(Lottery.MEGA_SENA)
                }
            }
        }
        (writers + readers).awaitAll()

        assertEquals(4_000, repo.count(Lottery.MEGA_SENA))
        assertEquals(4_000, repo.getLatestDraw(Lottery.MEGA_SENA)?.contestNumber)
    }
}
