package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

class NextDrawDtoTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `desserializa e mapeia o proximo concurso da mega-sena`() {
        val body = """
            {
              "numero": 2700,
              "dataApuracao": "01/06/2024",
              "dataProximoConcurso": "05/06/2024",
              "valorEstimadoProximoConcurso": 45000000.50,
              "tipoJogo": "MEGA_SENA"
            }
        """.trimIndent()

        val info = json.decodeFromString(NextDrawDto.serializer(), body)
            .toDomain(Lottery.MEGA_SENA)

        assertEquals(2700, info.contestNumber)
        assertEquals(LocalDateTime.of(2024, 6, 5, 0, 0), info.drawDate)
        assertEquals(45000000.50, info.estimatedPrize, 0.0)
        assertEquals(Lottery.MEGA_SENA, info.lottery)
    }

    @Test
    fun `mapeia para a loteria informada independente do payload`() {
        val body = """
            {
              "numero": 150,
              "dataApuracao": "01/06/2024",
              "dataProximoConcurso": "08/06/2024",
              "valorEstimadoProximoConcurso": 10000000.0
            }
        """.trimIndent()

        val info = json.decodeFromString(NextDrawDto.serializer(), body)
            .toDomain(Lottery.MAIS_MILIONARIA)

        assertEquals(Lottery.MAIS_MILIONARIA, info.lottery)
        assertEquals(150, info.contestNumber)
    }
}
