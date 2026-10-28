package com.volanteplus.loterias.data.seed

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Garante que o seed embarcado em `assets/seed/` — gerado por
 * `scripts/generate-android-seed.mjs` a partir do histórico já validado no
 * app web (`web/src/data/history/`) — continua íntegro: parseia sem erro,
 * cobre exatamente o intervalo declarado em `meta.json`, e (controles
 * positivos exigidos pela Constitution, Princípio III — NÃO NEGOCIÁVEL) um
 * seed corrompido é rejeitado de forma clara e localizável, nunca
 * silenciosa.
 */
class SeedHistoryIntegrityTest {

    private val parser = CsvDrawParser()

    private fun seedFile(name: String): File = File("src/main/assets/seed/$name")

    /** Histórico de referência (já validado), fonte única desta feature — ver Constitution, Princípio V. */
    private fun historyMeta(): kotlinx.serialization.json.JsonObject =
        Json.parseToJsonElement(File("../web/src/data/history/meta.json").readText()).jsonObject

    /** Lacunas/duplicatas na sequência de concursos — `CsvDrawParser` valida cada linha isoladamente, não a sequência. */
    private fun gapsInSequence(draws: List<Draw>): List<String> {
        val problems = mutableListOf<String>()
        draws.sortedBy { it.contestNumber }.forEachIndexed { index, draw ->
            if (draw.contestNumber != index + 1) {
                problems += "lacuna ou duplicata perto do concurso ${draw.contestNumber} (esperado ${index + 1})"
            }
        }
        return problems
    }

    @Test
    fun `megasena csv parseia sem erro e eh contigua de 1 ate o ultimo`() {
        val draws = parser.parse(Lottery.MEGA_SENA, seedFile("megasena.csv").readText())

        assertTrue("seed vazio", draws.isNotEmpty())
        assertTrue("lacuna/duplicata: ${gapsInSequence(draws)}", gapsInSequence(draws).isEmpty())
    }

    @Test
    fun `maismilionaria csv parseia sem erro e eh contigua de 1 ate o ultimo`() {
        val draws = parser.parse(Lottery.MAIS_MILIONARIA, seedFile("maismilionaria.csv").readText())

        assertTrue("seed vazio", draws.isNotEmpty())
        assertTrue("lacuna/duplicata: ${gapsInSequence(draws)}", gapsInSequence(draws).isEmpty())
    }

    @Test
    fun `megasena csv bate contagem e ultimo concurso com o historico de referencia da web`() {
        val draws = parser.parse(Lottery.MEGA_SENA, seedFile("megasena.csv").readText())
        val meta = historyMeta()["lotteries"]!!.jsonObject["megasena"]!!.jsonObject

        assertEquals(meta["count"]!!.jsonPrimitive.int, draws.size)
        assertEquals(meta["lastContest"]!!.jsonPrimitive.int, draws.maxOf { it.contestNumber })
    }

    @Test
    fun `maismilionaria csv bate contagem e ultimo concurso com o historico de referencia da web`() {
        val draws = parser.parse(Lottery.MAIS_MILIONARIA, seedFile("maismilionaria.csv").readText())
        val meta = historyMeta()["lotteries"]!!.jsonObject["maismilionaria"]!!.jsonObject

        assertEquals(meta["count"]!!.jsonPrimitive.int, draws.size)
        assertEquals(meta["lastContest"]!!.jsonPrimitive.int, draws.maxOf { it.contestNumber })
    }

    @Test
    fun `quina csv parseia sem erro e eh contigua de 1 ate o ultimo`() {
        val draws = parser.parse(Lottery.QUINA, seedFile("quina.csv").readText())

        assertTrue("seed vazio", draws.isNotEmpty())
        assertTrue("lacuna/duplicata: ${gapsInSequence(draws)}", gapsInSequence(draws).isEmpty())
        assertTrue("toda dezena em 1..80 e 5 por concurso", draws.all { it.numbers.size == 5 && it.numbers.all { n -> n in 1..80 } })
    }

    @Test
    fun `quina csv bate contagem e ultimo concurso com o historico de referencia da web`() {
        val draws = parser.parse(Lottery.QUINA, seedFile("quina.csv").readText())
        val meta = historyMeta()["lotteries"]!!.jsonObject["quina"]!!.jsonObject

        assertEquals(meta["count"]!!.jsonPrimitive.int, draws.size)
        assertEquals(meta["lastContest"]!!.jsonPrimitive.int, draws.maxOf { it.contestNumber })
    }

    // --- Controles positivos (Constitution, Princípio III — NÃO NEGOCIÁVEL) ---
    // Um instrumento que nunca acusa nada também passaria nos quatro testes acima;
    // estes dois provam que ele de fato rejeita o que deveria.

    @Test
    fun `controle positivo - dezena fora do universo da modalidade eh rejeitada`() {
        val corrompido = """
            # concurso;data;dezenas;trevos
            1;1996-03-11;4 5 30 33 41 52;
            2;1996-03-18;9 37 39 41 43 61;
        """.trimIndent() // 61 está fora de 1..60 (universo da Mega-Sena)

        assertThrows(IllegalArgumentException::class.java) {
            parser.parse(Lottery.MEGA_SENA, corrompido)
        }
    }

    @Test
    fun `controle positivo - lacuna na sequencia de concursos eh detectada`() {
        val comLacuna = """
            # concurso;data;dezenas;trevos
            1;1996-03-11;4 5 30 33 41 52;
            3;1996-03-25;10 11 29 30 36 47;
        """.trimIndent() // concurso 2 ausente entre 1 e 3

        // CsvDrawParser aceita cada linha isoladamente — a lacuna só aparece
        // na checagem de sequência, que é o próprio objeto deste teste.
        val draws = parser.parse(Lottery.MEGA_SENA, comLacuna)
        assertTrue("a lacuna deveria ter sido detectada", gapsInSequence(draws).isNotEmpty())
    }
    @Test
    fun `controle positivo - quina rejeita 6 dezenas, dezena 81 e trevo`() {
        val seisDezenas = "# concurso;data;dezenas;trevos\n1;1994-03-13;1 2 3 4 5 6;"
        val dezena81 = "# concurso;data;dezenas;trevos\n1;1994-03-13;5 20 33 61 81;"
        val comTrevo = "# concurso;data;dezenas;trevos\n1;1994-03-13;5 20 33 61 80;1 2"

        listOf(seisDezenas, dezena81, comTrevo).forEach { corrompido ->
            assertThrows(IllegalArgumentException::class.java) {
                parser.parse(Lottery.QUINA, corrompido)
            }
        }
    }
}
