package com.volanteplus.loterias.data.local

import androidx.room.Entity
import androidx.room.Index
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import java.time.LocalDate

/**
 * Linha da tabela de concursos. A data é persistida como epoch day (Long)
 * para permitir comparação eficiente na consulta com data de corte do
 * backtesting; as dezenas/trevos são ordenados na escrita para leitura
 * determinística.
 */
@Entity(
    tableName = "draws",
    primaryKeys = ["lottery", "contestNumber"],
    indices = [Index(value = ["lottery", "dateEpochDay"])],
)
data class DrawEntity(
    val lottery: Lottery,
    val contestNumber: Int,
    val dateEpochDay: Long,
    val numbers: List<Int>,
    val trevos: List<Int>,
) {
    fun toDomain(): Draw = Draw(
        lottery = lottery,
        contestNumber = contestNumber,
        date = LocalDate.ofEpochDay(dateEpochDay),
        numbers = numbers,
        trevos = trevos,
    )

    companion object {
        fun fromDomain(draw: Draw): DrawEntity = DrawEntity(
            lottery = draw.lottery,
            contestNumber = draw.contestNumber,
            dateEpochDay = draw.date.toEpochDay(),
            numbers = draw.numbers.sorted(),
            trevos = draw.trevos.sorted(),
        )
    }
}
