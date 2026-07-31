package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Resposta da API do Portal de Loterias da Caixa
 * (servicebus2.caixa.gov.br/portaldeloterias/api/{loteria}/{concurso}).
 * Apenas os campos consumidos são declarados; o restante é ignorado na
 * desserialização.
 */
@Serializable
data class CaixaDrawDto(
    val numero: Int,
    val dataApuracao: String,
    val listaDezenas: List<String>,
    val trevosSorteados: List<String> = emptyList(),
) {
    fun toDomain(lottery: Lottery): Draw = Draw(
        lottery = lottery,
        contestNumber = numero,
        date = LocalDate.parse(dataApuracao, DATE_FORMAT),
        numbers = listaDezenas.map { it.trim().toInt() },
        trevos = if (lottery.hasTrevos) trevosSorteados.map { it.trim().toInt() } else emptyList(),
    )

    companion object {
        private val DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    }
}
