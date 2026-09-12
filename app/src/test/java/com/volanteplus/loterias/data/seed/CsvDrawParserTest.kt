package com.volanteplus.loterias.data.seed

import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class CsvDrawParserTest {

    private val parser = CsvDrawParser()

    @Test
    fun `parseia seed da mega-sena com cabecalho e comentarios`() {
        val csv = """
            # histórico oficial
            concurso;data;dezenas;trevos
            2699;2024-05-30;01 05 20 33 47 60;
            2700;2024-06-01;04 12 23 34 45 56;
        """.trimIndent()

        val draws = parser.parse(Lottery.MEGA_SENA, csv)

        assertEquals(2, draws.size)
        assertEquals(2699, draws[0].contestNumber)
        assertEquals(LocalDate.of(2024, 6, 1), draws[1].date)
        assertEquals(listOf(4, 12, 23, 34, 45, 56), draws[1].numbers)
    }

    @Test
    fun `parseia seed da milionaria com trevos`() {
        val draws = parser.parse(
            Lottery.MAIS_MILIONARIA,
            "150;2024-06-01;01 02 03 04 05 06;2 5",
        )
        assertEquals(listOf(2, 5), draws.single().trevos)
    }

    @Test
    fun `linha invalida interrompe com numero da linha`() {
        val csv = """
            2699;2024-05-30;01 05 20 33 47 60;
            2700;2024-06-01;04 12 23;
        """.trimIndent()

        val error = assertThrows(IllegalArgumentException::class.java) {
            parser.parse(Lottery.MEGA_SENA, csv)
        }
        assertTrue(error.message!!.contains("Linha 2"))
    }

    @Test
    fun `conteudo vazio produz lista vazia`() {
        assertEquals(emptyList<Any>(), parser.parse(Lottery.MEGA_SENA, ""))
    }

    @Test
    fun `linha com numero de concurso corrompido nao e confundida com cabecalho`() {
        val csv = """
            concurso;data;dezenas;trevos
            2699;2024-05-30;01 05 20 33 47 60;
            ;2024-06-01;04 12 23 34 45 56;
        """.trimIndent()

        val error = assertThrows(IllegalArgumentException::class.java) {
            parser.parse(Lottery.MEGA_SENA, csv)
        }
        assertTrue(error.message!!.contains("Linha 3"))
    }
}
