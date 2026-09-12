package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime

class NextDrawDtoTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun testDtoMapping_toDomain() {
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

        assertEquals(2700, info?.contestNumber)
        assertEquals(LocalDateTime.of(2024, 6, 5, 0, 0), info?.drawDate)
        assertEquals(45000000.50, info?.estimatedPrize ?: 0.0, 0.0)
        assertEquals(Lottery.MEGA_SENA, info?.lottery)
    }

    @Test
    fun testDtoMapping_withNullValues() {
        val semData = json.decodeFromString(
            NextDrawDto.serializer(),
            """{"numero": 2700}""",
        )
        assertNull(semData.toDomain(Lottery.MEGA_SENA))

        val semPremio = json.decodeFromString(
            NextDrawDto.serializer(),
            """{"numero": 2700, "dataProximoConcurso": "05/06/2024"}""",
        )
        val info = semPremio.toDomain(Lottery.MEGA_SENA)
        assertEquals(0.0, info?.estimatedPrize ?: -1.0, 0.0)
        assertEquals(2700, info?.contestNumber)
    }
}
