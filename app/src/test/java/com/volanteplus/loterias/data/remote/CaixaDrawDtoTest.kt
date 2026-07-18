package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class CaixaDrawDtoTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `desserializa resposta da mega-sena ignorando campos extras`() {
        val body = """
            {
              "numero": 2700,
              "dataApuracao": "01/06/2024",
              "listaDezenas": ["04", "12", "23", "34", "45", "56"],
              "tipoJogo": "MEGA_SENA",
              "valorArrecadado": 12345.67
            }
        """.trimIndent()

        val draw = json.decodeFromString(CaixaDrawDto.serializer(), body)
            .toDomain(Lottery.MEGA_SENA)

        assertEquals(2700, draw.contestNumber)
        assertEquals(LocalDate.of(2024, 6, 1), draw.date)
        assertEquals(listOf(4, 12, 23, 34, 45, 56), draw.numbers)
        assertEquals(emptyList<Int>(), draw.trevos)
    }

    @Test
    fun `desserializa resposta da milionaria com trevos`() {
        val body = """
            {
              "numero": 150,
              "dataApuracao": "01/06/2024",
              "listaDezenas": ["01", "02", "03", "04", "05", "06"],
              "trevosSorteados": ["2", "5"]
            }
        """.trimIndent()

        val draw = json.decodeFromString(CaixaDrawDto.serializer(), body)
            .toDomain(Lottery.MAIS_MILIONARIA)

        assertEquals(150, draw.contestNumber)
        assertEquals(listOf(2, 5), draw.trevos)
    }
}
