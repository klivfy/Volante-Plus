package com.volanteplus.loterias.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.LocalDate

class DrawTest {

    private val date: LocalDate = LocalDate.of(2024, 6, 1)

    @Test
    fun `concurso valido da mega-sena`() {
        val draw = Draw(Lottery.MEGA_SENA, 2700, date, listOf(4, 12, 23, 34, 45, 56))
        assertEquals(6, draw.numbers.size)
    }

    @Test
    fun `concurso valido da milionaria exige 2 trevos`() {
        val draw = Draw(Lottery.MAIS_MILIONARIA, 150, date, listOf(1, 2, 3, 4, 5, 6), listOf(2, 5))
        assertEquals(listOf(2, 5), draw.trevos)
    }

    @Test
    fun `rejeita quantidade errada de dezenas`() {
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.MEGA_SENA, 1, date, listOf(1, 2, 3, 4, 5))
        }
    }

    @Test
    fun `rejeita dezena fora do intervalo`() {
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.MAIS_MILIONARIA, 1, date, listOf(1, 2, 3, 4, 5, 51), listOf(1, 2))
        }
    }

    @Test
    fun `rejeita dezenas repetidas`() {
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.MEGA_SENA, 1, date, listOf(1, 1, 3, 4, 5, 6))
        }
    }

    @Test
    fun `rejeita milionaria sem trevos`() {
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.MAIS_MILIONARIA, 1, date, listOf(1, 2, 3, 4, 5, 6))
        }
    }

    @Test
    fun `rejeita trevos na mega-sena`() {
        assertThrows(IllegalArgumentException::class.java) {
            Draw(Lottery.MEGA_SENA, 1, date, listOf(1, 2, 3, 4, 5, 6), listOf(1, 2))
        }
    }
}
