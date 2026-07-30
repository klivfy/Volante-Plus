package com.volanteplus.loterias.ui.volante.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import com.volanteplus.loterias.ui.theme.VolantePlusTheme
import java.text.NumberFormat
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

// WHY: os nomes de dia da semana via DateTimeFormatter dependem dos dados de
// localidade (ICU/CLDR) da JVM em execução — em pt-BR o padrão "abreviado"
// costuma incluir ponto (ex.: "sáb."), o que não bate com o formato exigido
// pelo design ("Sáb"). Uma tabela fixa garante o texto exato e independe do JDK.
private val WEEKDAY_ABBREVIATIONS = mapOf(
    DayOfWeek.MONDAY to "Seg",
    DayOfWeek.TUESDAY to "Ter",
    DayOfWeek.WEDNESDAY to "Qua",
    DayOfWeek.THURSDAY to "Qui",
    DayOfWeek.FRIDAY to "Sex",
    DayOfWeek.SATURDAY to "Sáb",
    DayOfWeek.SUNDAY to "Dom",
)

/**
 * Card do próximo concurso ainda não realizado, exibido no topo do Volante.
 * `nextDrawInfo` nulo cobre tanto "carregando" quanto "API indisponível" —
 * a tela não distingue os dois casos porque nenhuma ação do usuário muda com
 * a distinção (o gerador de jogos não depende desses dados).
 */
@Composable
fun NextDrawCard(nextDrawInfo: NextDrawInfo?, modifier: Modifier = Modifier) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        if (nextDrawInfo == null) {
            UnavailableContent()
        } else {
            AvailableContent(nextDrawInfo)
        }
    }
}

@Composable
private fun UnavailableContent() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.CloudOff,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Informações indisponíveis",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

@Composable
private fun AvailableContent(info: NextDrawInfo) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Text(
            text = "Próximo Concurso #${info.contestNumber}",
            style = MaterialTheme.typography.titleLarge,
        )
        InfoRow(
            icon = Icons.Filled.DateRange,
            text = formatDate(info.drawDate.toLocalDate()),
            modifier = Modifier.padding(top = 12.dp),
        )
        InfoRow(
            icon = Icons.Filled.Schedule,
            text = info.drawDate.toLocalTime().format(TIME_FORMAT),
            modifier = Modifier.padding(top = 8.dp),
        )
        InfoRow(
            icon = Icons.Filled.AttachMoney,
            text = formatCurrency(info.estimatedPrize),
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun InfoRow(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/** "Sáb, 02/08/2026". */
private fun formatDate(date: LocalDate): String =
    "${WEEKDAY_ABBREVIATIONS.getValue(date.dayOfWeek)}, ${date.format(DATE_FORMAT)}"

/** "R$ 60.000.000,00". */
private fun formatCurrency(value: Double): String =
    NumberFormat.getCurrencyInstance(Locale("pt", "BR")).format(value)

@Preview(showBackground = true)
@Composable
private fun NextDrawCardAvailablePreview() {
    VolantePlusTheme {
        NextDrawCard(
            nextDrawInfo = NextDrawInfo(
                contestNumber = 2830,
                drawDate = LocalDateTime.of(2026, 8, 2, 20, 0),
                estimatedPrize = 60_000_000.0,
                lottery = Lottery.MEGA_SENA,
            ),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun NextDrawCardUnavailablePreview() {
    VolantePlusTheme {
        NextDrawCard(nextDrawInfo = null)
    }
}
