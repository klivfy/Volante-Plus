package com.volanteplus.loterias.domain.backtest

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sqrt
import kotlin.random.Random

class MonteCarloSummaryTest {

    /**
     * Lei da variância total: com réplicas idênticas entre si, toda a variação
     * é intrínseca e nenhuma é ruído do método.
     */
    @Test
    fun `replicas identicas nao geram ruido de metodo`() {
        val serie = listOf(0.0, 1.0, 2.0, 0.0, 1.0)
        val resumo = MonteCarloSummary.from(List(10) { serie })
        assertEquals(0.0, resumo.decomposition.monteCarlo, 1e-12)
        assertEquals(0.0, resumo.decomposition.monteCarloFraction, 1e-12)
        assertEquals(0.0, resumo.standardError, 1e-12)
        // média de (0,1,2,0,1) = 0,8; variância amostral = 2,8 / 4 = 0,7
        assertEquals(0.7, resumo.decomposition.intrinsic, 1e-12)
        assertEquals(0.8, resumo.meanOfMeans, 1e-12)
    }

    /**
     * Caso oposto: réplicas constantes internamente, mas diferentes entre si.
     * Toda a variação é do método.
     */
    @Test
    fun `replicas constantes internamente atribuem tudo ao metodo`() {
        val resumo = MonteCarloSummary.from(
            listOf(List(4) { 0.0 }, List(4) { 1.0 }, List(4) { 2.0 }),
        )
        assertEquals(0.0, resumo.decomposition.intrinsic, 1e-12)
        assertEquals(1.0, resumo.decomposition.monteCarlo, 1e-12)
        assertEquals(1.0, resumo.decomposition.monteCarloFraction, 1e-12)
        assertEquals(1.0, resumo.meanOfMeans, 1e-12)
        // erro padrão = sqrt(1/3)
        assertEquals(sqrt(1.0 / 3.0), resumo.standardError, 1e-12)
    }

    /** Uma réplica só não permite separar as fontes — e não deve fingir que permite. */
    @Test
    fun `uma replica reporta ruido zero e intervalo degenerado`() {
        val resumo = MonteCarloSummary.from(listOf(listOf(0.0, 1.0, 2.0)))
        assertEquals(1, resumo.replications)
        assertEquals(0.0, resumo.standardError, 1e-12)
        assertEquals(0.0, resumo.decomposition.monteCarlo, 1e-12)
        assertEquals(resumo.interval.lower, resumo.interval.upper, 1e-12)
    }

    /**
     * A promessa quantitativa da entrega: o erro padrão entre réplicas cai com
     * √R. Comparamos R=16 contra R=256 (fator esperado 4) sobre o mesmo
     * processo gerador, com tolerância generosa por ser estimativa.
     */
    @Test
    fun `erro padrao cai aproximadamente com a raiz do numero de replicas`() {
        fun replicar(quantidade: Int, semente: Int): Double {
            val rng = Random(semente)
            val series = List(quantidade) { List(30) { rng.nextDouble() } }
            return MonteCarloSummary.from(series).standardError
        }
        val se16 = replicar(16, 11)
        val se256 = replicar(256, 11)
        val razao = se16 / se256
        assertTrue(
            "Razão esperada ≈ 4, obtida $razao (se16=$se16, se256=$se256)",
            razao in 2.5..6.5,
        )
    }

    @Test
    fun `intervalo de confianca cobre a media estimada`() {
        val rng = Random(7)
        val resumo = MonteCarloSummary.from(List(200) { List(30) { rng.nextDouble() } })
        assertTrue(resumo.interval.contains(resumo.meanOfMeans))
        assertTrue(resumo.interval.lower < resumo.interval.upper)
        // média de uniformes em [0,1) deve ficar perto de 0,5
        assertEquals(0.5, resumo.meanOfMeans, 0.02)
    }

    @Test
    fun `soma das parcelas e a variancia total`() {
        val rng = Random(3)
        val d = MonteCarloSummary.from(List(50) { List(20) { rng.nextDouble() } }).decomposition
        assertEquals(d.intrinsic + d.monteCarlo, d.total, 1e-12)
        assertTrue(d.intrinsic > 0.0)
        assertTrue(d.monteCarlo > 0.0)
    }

    @Test
    fun `sementes de replicas sao distintas e deterministicas`() {
        val sementes = (0 until 200).map { BacktestEngine.replicationSeed(42L, it) }
        assertEquals("Sementes repetidas entre réplicas", 200, sementes.toSet().size)
        assertEquals(sementes, (0 until 200).map { BacktestEngine.replicationSeed(42L, it) })
        assertNotEquals(
            BacktestEngine.replicationSeed(42L, 0),
            BacktestEngine.replicationSeed(43L, 0),
        )
    }

    @Test
    fun `lista vazia de replicas e rejeitada`() {
        val erro = runCatching { MonteCarloSummary.from(emptyList()) }.exceptionOrNull()
        assertTrue(erro is IllegalArgumentException)
    }
}
