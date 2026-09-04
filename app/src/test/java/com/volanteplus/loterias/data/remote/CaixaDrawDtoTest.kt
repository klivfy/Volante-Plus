package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    @Test
    fun `monta retrato do proximo concurso com os campos financeiros`() {
        // Valores reais do concurso 2620 (12/08/2023), com acumulado fictício
        // para o seguinte, no formato exato que a API da Caixa devolve.
        val body = """
            {
              "numero": 2620,
              "dataApuracao": "12/08/2023",
              "listaDezenas": ["11", "20", "27", "37", "43", "48"],
              "acumulado": false,
              "valorArrecadado": 161458740.0,
              "valorAcumuladoProximoConcurso": 3500000.5,
              "valorEstimadoProximoConcurso": 12000000.0,
              "numeroConcursoProximo": 2621,
              "dataProximoConcurso": "16/08/2023"
            }
        """.trimIndent()

        val outlook = json.decodeFromString(CaixaDrawDto.serializer(), body)
            .toOutlook(Lottery.MEGA_SENA)

        assertEquals(Lottery.MEGA_SENA, outlook.lottery)
        assertEquals(2620, outlook.lastContest)
        assertEquals(2621, outlook.nextContest)
        assertEquals(LocalDate.of(2023, 8, 16), outlook.nextDate)
        assertEquals(161_458_740.0, outlook.lastCollection, 1e-6)
        assertEquals(3_500_000.5, outlook.accumulatedForNext, 1e-6)
        assertEquals(12_000_000.0, outlook.estimatedTopPrize, 1e-6)
        assertFalse(outlook.lastAccumulated)
    }

    @Test
    fun `retrato tolera resposta sem os campos financeiros`() {
        // Espelhos antigos da API podem não trazer esses campos; o app deve
        // degradar para "sem informação", nunca quebrar a sincronização.
        val body = """
            {
              "numero": 2700,
              "dataApuracao": "01/06/2024",
              "listaDezenas": ["04", "12", "23", "34", "45", "56"]
            }
        """.trimIndent()

        val outlook = json.decodeFromString(CaixaDrawDto.serializer(), body)
            .toOutlook(Lottery.MEGA_SENA)

        assertEquals(2700, outlook.lastContest)
        assertEquals(0, outlook.nextContest)
        assertNull(outlook.nextDate)
        assertEquals(0.0, outlook.lastCollection, 0.0)
        assertEquals(0.0, outlook.accumulatedForNext, 0.0)
        assertFalse(outlook.lastAccumulated)
    }

    @Test
    fun `data do proximo concurso invalida vira nula em vez de excecao`() {
        val body = """
            {
              "numero": 2700,
              "dataApuracao": "01/06/2024",
              "listaDezenas": ["04", "12", "23", "34", "45", "56"],
              "dataProximoConcurso": "a definir",
              "acumulado": true
            }
        """.trimIndent()

        val outlook = json.decodeFromString(CaixaDrawDto.serializer(), body)
            .toOutlook(Lottery.MEGA_SENA)

        assertNull(outlook.nextDate)
        assertTrue(outlook.lastAccumulated)
    }
}
