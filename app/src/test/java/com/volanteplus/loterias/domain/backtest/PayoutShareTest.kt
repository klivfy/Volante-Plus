package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.generator.Unpopularity
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GeneratedGame
import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random
import kotlin.math.abs

/**
 * O módulo do rateio faz uma afirmação forte — que existe uma otimização
 * legítima em loteria — então precisa provar as duas metades dela: que o
 * ganho no rateio é real e que a chance de ganhar continua intocada.
 */
class PayoutShareTest {

    private val tickets = 20_000_000.0

    @Test
    fun `fator de diluicao vale 1 quando ninguem mais joga a combinacao`() {
        assertEquals(1.0, PayoutShare.crowdingFactor(0.0, tickets), 1e-12)
    }

    @Test
    fun `fator de diluicao cai monotonicamente com a popularidade`() {
        val q0 = PayoutShare.uniformSelectionProbability(Lottery.MEGA_SENA)
        val fatores = listOf(0.25, 0.5, 1.0, 2.0, 4.0, 8.0)
            .map { PayoutShare.crowdingFactor(q0 * it, tickets) }
        fatores.zipWithNext().forEach { (maior, menor) ->
            assertTrue("Diluição deveria crescer com a popularidade", maior > menor)
        }
        fatores.forEach { assertTrue(it in 0.0..1.0) }
    }

    /**
     * A identidade E[1/(1+K)] = (1 − (1−q)^N)/(N·q) é o coração do módulo.
     * Aqui ela é conferida contra a esperança calculada termo a termo sobre a
     * binomial, sem reaproveitar a fórmula fechada.
     */
    @Test
    fun `formula fechada bate com a esperanca calculada termo a termo`() {
        val n = 400
        for (q in listOf(0.001, 0.005, 0.02)) {
            // E[1/(1+K)] com K ~ Binomial(n-1, q), somando a pmf diretamente.
            var esperanca = 0.0
            var pmf = Math.pow(1 - q, (n - 1).toDouble())
            for (k in 0 until n) {
                esperanca += pmf / (1 + k)
                pmf *= (n - 1 - k).toDouble() / (k + 1) * (q / (1 - q))
                if (pmf == 0.0) break
            }
            val fechada = PayoutShare.crowdingFactor(q, n.toDouble())
            assertEquals("q=$q", esperanca, fechada, 1e-9)
        }
    }

    @Test
    fun `combinacao menos popular rende mais premio condicional a ganhar`() {
        val lot = Lottery.MEGA_SENA
        val populares = PayoutShare.evaluate(lot, listOf(1, 2, 3, 4, 5, 6), tickets)
        val impopulares = PayoutShare.evaluate(lot, listOf(34, 39, 46, 52, 57, 60), tickets)

        assertTrue("Sequência 1-6 deveria ser muito popular", populares.relativePopularity > 1.0)
        assertTrue("Dezenas altas espalhadas deveriam ser impopulares", impopulares.betterThanAverage)
        assertTrue(impopulares.conditionalGain > populares.conditionalGain)
        assertTrue("Ganho deveria ser positivo para a impopular", impopulares.conditionalGain > 0.0)
    }

    /**
     * O teste que sustenta a honestidade do módulo: qualquer que seja a
     * combinação escolhida, a probabilidade de acertar é rigorosamente a
     * mesma. Se este teste falhasse, o app estaria vendendo previsão.
     */
    @Test
    fun `otimizacao de rateio nao altera a probabilidade de acerto`() {
        val lot = Lottery.MEGA_SENA
        val teorica = Hypergeometric.distributionFor(lot)
        val jogos = listOf(
            listOf(1, 2, 3, 4, 5, 6),
            listOf(3, 7, 12, 19, 25, 31),
            listOf(34, 39, 46, 52, 57, 60),
            listOf(2, 13, 27, 38, 44, 59),
        )
        // A distribuição de acertos de um jogo é função só do tamanho do jogo
        // e do universo — nunca das dezenas. Verificado por simulação sobre
        // sorteios uniformes independentes.
        val random = Random(20260910L)
        val universo = lot.numberRange.toList()
        val sorteios = List(40_000) {
            val s = LinkedHashSet<Int>(6)
            while (s.size < 6) s += universo[random.nextInt(universo.size)]
            s
        }
        val esperada = Hypergeometric.meanFor(lot)
        jogos.forEach { jogo ->
            val media = sorteios.sumOf { s -> jogo.count(s::contains) }.toDouble() / sorteios.size
            assertEquals(
                "Jogo $jogo destoou da média teórica — a invariância foi violada",
                esperada,
                media,
                0.02,
            )
        }
        assertEquals(1.0, teorica.values.sum(), 1e-12)
    }

    @Test
    fun `popularidade relativa media fica proxima de 1 em jogos aleatorios`() {
        val lot = Lottery.MEGA_SENA
        val random = Random(4242L)
        val universo = lot.numberRange.toList()
        val media = List(3_000) {
            val g = LinkedHashSet<Int>(6)
            while (g.size < 6) g += universo[random.nextInt(universo.size)]
            PayoutShare.relativePopularity(lot, g.toList())
        }.average()
        // A régua é padronizada sobre combinações uniformes; a média de
        // exp(β·z) fica um pouco acima de 1 (desigualdade de Jensen), mas não
        // pode derivar longe disso ou a calibração está quebrada.
        assertTrue("Média da popularidade relativa fora do esperado: $media", media in 0.9..1.3)
    }

    @Test
    fun `a regua de popularidade e deterministica entre chamadas`() {
        val jogo = listOf(5, 17, 23, 41, 48, 55)
        val primeira = PayoutShare.relativePopularity(Lottery.MEGA_SENA, jogo)
        val segunda = PayoutShare.relativePopularity(Lottery.MEGA_SENA, jogo)
        assertEquals(primeira, segunda, 0.0)
    }

    @Test
    fun `avaliacao de lote agrega os jogos e traz a ressalva`() {
        val batch = GameBatch(
            lottery = Lottery.MEGA_SENA,
            games = listOf(
                GeneratedGame(listOf(34, 39, 46, 52, 57, 60)),
                GeneratedGame(listOf(1, 2, 3, 4, 5, 6)),
            ),
        )
        val avaliacao = PayoutShare.evaluateBatch(batch, tickets)
        assertEquals(2, avaliacao.games.size)
        assertEquals(1, avaliacao.betterThanAverageCount)
        assertTrue(avaliacao.disclaimer.contains("não é chance de ganhar"))
        assertEquals(
            avaliacao.games.map { it.conditionalGain }.average(),
            avaliacao.averageConditionalGain,
            1e-12,
        )
    }

    @Test
    fun `penalidade e popularidade relativa andam na mesma direcao`() {
        val lot = Lottery.MEGA_SENA
        val a = listOf(1, 2, 3, 4, 5, 6)
        val b = listOf(34, 39, 46, 52, 57, 60)
        val penaltyMaior = Unpopularity.penalty(lot, a) > Unpopularity.penalty(lot, b)
        val popularidadeMaior =
            PayoutShare.relativePopularity(lot, a) > PayoutShare.relativePopularity(lot, b)
        assertEquals(penaltyMaior, popularidadeMaior)
        assertNotEquals(
            PayoutShare.relativePopularity(lot, a),
            PayoutShare.relativePopularity(lot, b),
        )
    }

    @Test
    fun `parametros invalidos sao rejeitados`() {
        assertTrue(
            runCatching { PayoutShare.crowdingFactor(-0.1, tickets) }
                .exceptionOrNull() is IllegalArgumentException,
        )
        assertTrue(
            runCatching { PayoutShare.crowdingFactor(0.5, 0.5) }
                .exceptionOrNull() is IllegalArgumentException,
        )
        assertTrue(
            runCatching { PayoutShare.conditionalPayoutGain(Lottery.MEGA_SENA, 0.0, tickets) }
                .exceptionOrNull() is IllegalArgumentException,
        )
    }

    @Test
    fun `ganho e nulo quando a popularidade e exatamente a media`() {
        val ganho = PayoutShare.conditionalPayoutGain(Lottery.MEGA_SENA, 1.0, tickets)
        assertTrue("Ganho deveria ser ~0 na média, veio $ganho", abs(ganho) < 1e-12)
    }
}
