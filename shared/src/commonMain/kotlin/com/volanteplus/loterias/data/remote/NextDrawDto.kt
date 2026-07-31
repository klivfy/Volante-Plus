package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Resposta da API do Portal de Loterias da Caixa com os dados do próximo
 * concurso (mesmo payload de [CaixaDrawDto], campos adicionais). Apenas os
 * campos consumidos são declarados.
 */
@Serializable
data class NextDrawDto(
    @SerialName("numero") val numero: Int,
    @SerialName("dataApuracao") val dataApuracao: String? = null,
    // WHY: nulos quando o próximo concurso ainda não foi aberto pela Caixa
    // (ex.: logo após a apuração, antes de o próximo ser configurado).
    @SerialName("dataProximoConcurso") val dataProximoConcurso: String? = null,
    @SerialName("valorEstimadoProximoConcurso") val valorEstimadoProximoConcurso: Double? = null,
) {
    /** Null quando a data do próximo concurso ainda não está disponível. */
    fun toDomain(lottery: Lottery): NextDrawInfo? {
        val date = dataProximoConcurso ?: return null
        return NextDrawInfo(
            contestNumber = numero,
            // WHY: a API só publica data (dd/MM/yyyy), sem horário — meia-noite
            // é o único valor determinístico para preencher o LocalDateTime.
            drawDate = LocalDate.parse(date, DATE_FORMAT).atStartOfDay(),
            estimatedPrize = valorEstimadoProximoConcurso ?: 0.0,
            lottery = lottery,
        )
    }

    companion object {
        private val DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    }
}
