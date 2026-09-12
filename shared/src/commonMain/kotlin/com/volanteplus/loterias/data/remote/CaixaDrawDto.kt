package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.ContestOutlook
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Resposta da API do Portal de Loterias da Caixa
 * (servicebus2.caixa.gov.br/portaldeloterias/api/{loteria}/{concurso}).
 * Apenas os campos consumidos são declarados; o restante é ignorado na
 * desserialização. Os campos financeiros têm valor padrão porque respostas
 * de concursos antigos podem omiti-los — a ausência não pode impedir a
 * importação do resultado.
 */
@Serializable
data class CaixaDrawDto(
    val numero: Int,
    val dataApuracao: String,
    val listaDezenas: List<String>,
    val trevosSorteados: List<String> = emptyList(),
    /** true quando ninguém acertou a faixa principal. */
    val acumulado: Boolean = false,
    /** Arrecadação total do concurso, em reais. */
    val valorArrecadado: Double = 0.0,
    /** Valor já acumulado para a faixa principal do próximo concurso. */
    val valorAcumuladoProximoConcurso: Double = 0.0,
    /** Estimativa oficial do prêmio principal do próximo concurso. */
    val valorEstimadoProximoConcurso: Double = 0.0,
    val numeroConcursoProximo: Int = 0,
    /** Data do próximo sorteio no formato dd/MM/yyyy; pode vir vazia. */
    val dataProximoConcurso: String? = null,
) {
    fun toDomain(lottery: Lottery): Draw = Draw(
        lottery = lottery,
        contestNumber = numero,
        date = LocalDate.parse(dataApuracao, DATE_FORMAT),
        numbers = listaDezenas.map { it.trim().toInt() },
        trevos = if (lottery.hasTrevos) trevosSorteados.map { it.trim().toInt() } else emptyList(),
    )

    /** Retrato financeiro do próximo concurso, a partir do resultado deste. */
    fun toOutlook(lottery: Lottery): ContestOutlook = ContestOutlook(
        lottery = lottery,
        lastContest = numero,
        nextContest = numeroConcursoProximo,
        nextDate = dataProximoConcurso?.takeIf { it.isNotBlank() }?.let { raw ->
            try {
                LocalDate.parse(raw.trim(), DATE_FORMAT)
            } catch (_: DateTimeParseException) {
                null
            }
        },
        accumulatedForNext = valorAcumuladoProximoConcurso.coerceAtLeast(0.0),
        estimatedTopPrize = valorEstimadoProximoConcurso.coerceAtLeast(0.0),
        lastCollection = valorArrecadado.coerceAtLeast(0.0),
        lastAccumulated = acumulado,
    )

    companion object {
        private val DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    }
}
