package com.volanteplus.loterias.domain.model

import java.time.LocalDateTime

/** Dados do próximo concurso ainda não realizado (data e prêmio estimado). */
data class NextDrawInfo(
    val contestNumber: Int,
    val drawDate: LocalDateTime,
    val estimatedPrize: Double,
    val lottery: Lottery,
)
