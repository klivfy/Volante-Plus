package com.volanteplus.loterias.domain.model

import java.time.LocalDate

/**
 * Situação financeira do próximo concurso, conforme publicada pela Caixa
 * junto ao resultado do último. Não é persistida: é um retrato do momento,
 * buscado sob demanda, e fica obsoleta assim que o próximo sorteio ocorre.
 *
 * Todos os valores em reais.
 */
data class ContestOutlook(
    val lottery: Lottery,
    /** Último concurso apurado. */
    val lastContest: Int,
    /** Número do próximo concurso (0 quando a API não informa). */
    val nextContest: Int,
    /** Data do próximo sorteio, quando informada. */
    val nextDate: LocalDate?,
    /**
     * Valor que já está garantido na faixa principal do próximo concurso por
     * ter sido acumulado de concursos anteriores. É dinheiro que não virá da
     * arrecadação do próximo concurso — daí seu efeito sobre o retorno
     * esperado de quem aposta nele.
     */
    val accumulatedForNext: Double,
    /** Estimativa oficial do prêmio principal do próximo concurso. */
    val estimatedTopPrize: Double,
    /**
     * Arrecadação do último concurso. Serve de proxy para o número de
     * apostas do próximo — o único dado disponível antes do sorteio.
     */
    val lastCollection: Double,
    /** true quando o último concurso não teve ganhador na faixa principal. */
    val lastAccumulated: Boolean,
) {
    init {
        require(lastContest > 0) { "Número de concurso inválido: $lastContest" }
        require(accumulatedForNext >= 0.0) { "Acumulado negativo: $accumulatedForNext" }
        require(estimatedTopPrize >= 0.0) { "Estimativa negativa: $estimatedTopPrize" }
        require(lastCollection >= 0.0) { "Arrecadação negativa: $lastCollection" }
    }
}
