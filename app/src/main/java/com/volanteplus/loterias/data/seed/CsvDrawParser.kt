package com.volanteplus.loterias.data.seed

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import java.time.LocalDate

/**
 * Parser do formato CSV de seed embarcado em assets/seed/:
 *
 * ```
 * # comentário
 * concurso;data;dezenas;trevos
 * 2700;2024-06-01;04 12 23 34 45 56;
 * 150;2024-06-01;01 02 03 04 05 06;2 5
 * ```
 *
 * - Separador `;`, data em ISO-8601 (yyyy-MM-dd), dezenas/trevos separados
 *   por espaço; a coluna de trevos fica vazia para a Mega-Sena.
 * - Linhas em branco, comentários (`#`) e o cabeçalho são ignorados.
 * - Qualquer linha inválida interrompe a importação com erro descritivo —
 *   seed corrompido não deve entrar silenciosamente no banco.
 */
class CsvDrawParser {

    fun parse(lottery: Lottery, content: String): List<Draw> =
        content.lineSequence()
            .withIndex()
            .map { (index, raw) -> index + 1 to raw.trim() }
            .filter { (_, line) -> line.isNotEmpty() && !line.startsWith("#") && !isHeader(line) }
            .map { (lineNumber, line) -> parseLine(lottery, lineNumber, line) }
            .toList()

    private fun isHeader(line: String): Boolean =
        line.substringBefore(';').toIntOrNull() == null

    private fun parseLine(lottery: Lottery, lineNumber: Int, line: String): Draw {
        val columns = line.split(';')
        require(columns.size in 3..4) {
            "Linha $lineNumber: esperadas 3 ou 4 colunas, encontradas ${columns.size}"
        }
        return try {
            Draw(
                lottery = lottery,
                contestNumber = columns[0].trim().toInt(),
                date = LocalDate.parse(columns[1].trim()),
                numbers = parseNumbers(columns[2]),
                trevos = columns.getOrNull(3)?.let(::parseNumbers) ?: emptyList(),
            )
        } catch (e: IllegalArgumentException) {
            throw IllegalArgumentException("Linha $lineNumber: ${e.message}", e)
        } catch (e: Exception) {
            throw IllegalArgumentException("Linha $lineNumber inválida: $line", e)
        }
    }

    private fun parseNumbers(column: String): List<Int> =
        column.trim().split(' ').filter { it.isNotEmpty() }.map(String::toInt)
}
