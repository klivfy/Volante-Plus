package com.volanteplus.loterias.data.seed

import android.content.Context
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.model.Lottery

/**
 * Importa o seed embarcado (assets/seed/megasena.csv e
 * assets/seed/maismilionaria.csv) na primeira execução, evitando milhares
 * de chamadas à API para carregar o histórico completo. A sincronização
 * incremental via API cobre os concursos posteriores ao seed.
 */
class AssetDrawSeeder(
    private val context: Context,
    private val repository: DrawRepository,
    private val parser: CsvDrawParser = CsvDrawParser(),
) {

    /**
     * Executa o seed para [lottery] se a tabela local estiver vazia e o
     * asset existir. Retorna a quantidade de concursos importados.
     */
    suspend fun seedIfEmpty(lottery: Lottery): Int {
        if (repository.count(lottery) > 0) return 0
        val content = readAsset(assetPath(lottery)) ?: return 0
        val draws = parser.parse(lottery, content)
        repository.upsertAll(draws)
        return draws.size
    }

    private fun assetPath(lottery: Lottery): String = when (lottery) {
        Lottery.MEGA_SENA -> "seed/megasena.csv"
        Lottery.MAIS_MILIONARIA -> "seed/maismilionaria.csv"
        Lottery.QUINA -> "seed/quina.csv"
    }

    private fun readAsset(path: String): String? = try {
        context.assets.open(path).bufferedReader().use { it.readText() }
    } catch (_: java.io.FileNotFoundException) {
        null
    }
}
