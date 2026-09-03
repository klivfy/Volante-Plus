package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Valores de referência calculados em forma fechada com aritmética exata
 * (C(K,k)·C(N−K,n−k)/C(N,n)) e conferidos contra `scipy.stats.hypergeom`.
 */
class HypergeometricTest {

    @Test
    fun `distribuicao exata da mega-sena`() {
        val expected = mapOf(
            0 to 0.5158844124,
            1 to 0.3790171193,
            2 to 0.0947542798,
            3 to 0.0099089443,
            4 to 0.0004287524,
            5 to 0.0000064717,
            6 to 0.0000000200,
        )
        val actual = Hypergeometric.distributionFor(Lottery.MEGA_SENA)

        expected.forEach { (hits, probability) ->
            assertEquals("P(X=$hits)", probability, actual.getValue(hits), 1e-10)
        }
        assertEquals(1.0, actual.values.sum(), 1e-12)
    }

    @Test
    fun `media e variancia teoricas da mega-sena`() {
        // E = n·K/N = 6·6/60; Var = n·(K/N)·(1−K/N)·(N−n)/(N−1)
        assertEquals(0.6, Hypergeometric.meanFor(Lottery.MEGA_SENA), 1e-12)
        assertEquals(0.4942372881, Hypergeometric.varianceFor(Lottery.MEGA_SENA), 1e-9)
        assertEquals(0.7030201192, Hypergeometric.stdDeviationFor(Lottery.MEGA_SENA), 1e-9)
    }

    @Test
    fun `media e variancia teoricas da mais milionaria`() {
        assertEquals(0.72, Hypergeometric.meanFor(Lottery.MAIS_MILIONARIA), 1e-12)
        assertEquals(0.5689469388, Hypergeometric.varianceFor(Lottery.MAIS_MILIONARIA), 1e-9)
    }

    @Test
    fun `probabilidade de premiacao por loteria`() {
        // Mega-Sena: quadra ou mais -> 1 em 2.298
        val mega = Hypergeometric.prizeProbabilityFor(Lottery.MEGA_SENA)
        assertEquals(0.0004352441, mega, 1e-10)
        assertEquals(2297.6, 1.0 / mega, 0.5)

        // +Milionária: faixa mínima premiada -> 1 em 98
        val milionaria = Hypergeometric.prizeProbabilityFor(Lottery.MAIS_MILIONARIA)
        assertEquals(0.0102065149, milionaria, 1e-10)
    }

    @Test
    fun `distribuicao dos trevos da mais milionaria`() {
        // N=6 trevos, K=2 sorteados, n=2 escolhidos
        assertEquals(0.4, Hypergeometric.trevoProbability(0), 1e-12)
        assertEquals(8.0 / 15.0, Hypergeometric.trevoProbability(1), 1e-12)
        assertEquals(1.0 / 15.0, Hypergeometric.trevoProbability(2), 1e-12)
        val total = (0..2).sumOf { Hypergeometric.trevoProbability(it) }
        assertEquals(1.0, total, 1e-12)
    }

    @Test
    fun `probabilidade e zero fora do suporte`() {
        // acertos negativos ou acima do tamanho do jogo
        assertEquals(0.0, Hypergeometric.probability(N = 60, K = 6, n = 6, k = -1), 0.0)
        assertEquals(0.0, Hypergeometric.probability(N = 60, K = 6, n = 6, k = 7), 0.0)
        // limite inferior do suporte: com N=10, K=8, n=5 sobram só 2 não
        // sorteadas, logo k >= 3 obrigatoriamente
        assertEquals(0.0, Hypergeometric.probability(N = 10, K = 8, n = 5, k = 2), 0.0)
        assertTrue(Hypergeometric.probability(N = 10, K = 8, n = 5, k = 3) > 0.0)
    }

    @Test
    fun `parametros invalidos sao rejeitados`() {
        listOf(
            Triple(-1, 6, 6),   // universo negativo
            Triple(60, -1, 6),  // sorteadas negativas
            Triple(60, 6, -1),  // jogo negativo
            Triple(60, 61, 6),  // sorteadas acima do universo
            Triple(60, 6, 61),  // jogo acima do universo
        ).forEach { (n, k, draw) ->
            val error = runCatching {
                Hypergeometric.probability(N = n, K = k, n = draw, k = 1)
            }.exceptionOrNull()
            assertTrue("N=$n K=$k n=$draw deveria falhar", error is IllegalArgumentException)
        }
    }

    @Test
    fun `caso degenerado onde o jogo cobre todo o universo`() {
        // escolher todas as 6 de um universo de 6: acerta as 6 com certeza
        assertEquals(1.0, Hypergeometric.probability(N = 6, K = 6, n = 6, k = 6), 1e-12)
        assertEquals(0.0, Hypergeometric.variance(N = 6, K = 6, n = 6), 1e-12)
    }

    @Test
    fun `distribuicao e sempre uma medida de probabilidade valida`() {
        listOf(
            Triple(60, 6, 6), Triple(50, 6, 6), Triple(60, 6, 15), Triple(25, 15, 15),
        ).forEach { (n, k, draw) ->
            val dist = Hypergeometric.distribution(n, k, draw)
            assertEquals("soma N=$n", 1.0, dist.values.sum(), 1e-10)
            assertTrue("nao negativa N=$n", dist.values.all { it >= 0.0 })
            // média da distribuição confere com a fórmula fechada
            val mean = dist.entries.sumOf { (hits, p) -> hits * p }
            assertEquals(Hypergeometric.mean(n, k, draw), mean, 1e-9)
        }
    }
}
