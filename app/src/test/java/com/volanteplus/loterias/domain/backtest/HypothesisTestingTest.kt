package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sqrt
import kotlin.random.Random

class HypothesisTestingTest {

    private val theoretical = Hypergeometric.distributionFor(Lottery.MEGA_SENA)
    private val theoreticalMean = 0.6

    private fun evaluate(
        series: List<Double>,
        distribution: Map<Int, Int> = distributionFrom(series),
        gamesPerContest: Int = 1,
        alpha: Double = 0.05,
        comparisons: Int = 1,
    ) = HypothesisTesting.evaluate(
        meanHitsPerContest = series,
        hitDistribution = distribution,
        theoreticalDistribution = theoretical,
        theoreticalMean = theoreticalMean,
        gamesPerContest = gamesPerContest,
        alpha = alpha,
        comparisons = comparisons,
    )

    /** Distribuição plausível a partir da série, para não deixar o qui-quadrado vazio. */
    private fun distributionFrom(series: List<Double>): Map<Int, Int> {
        val total = series.size.coerceAtLeast(1)
        return theoretical.mapValues { (_, p) -> Math.round(p * total).toInt() }
            .filterValues { it > 0 }
    }

    @Test
    fun `serie amostrada da distribuicao teorica nao refuta a aleatoriedade`() {
        // 5.000 concursos: poder de sobra para o efeito mínimo de interesse
        val random = Random(20240630)
        val series = List(5_000) { sampleHits(random).toDouble() }

        val result = evaluate(series, distribution = observed(series))

        assertEquals(Verdict.NAO_REFUTA_ALEATORIEDADE, result.verdict)
        assertTrue("valor-p ${result.meanTest.pValue}", result.meanTest.pValue > 0.05)
        assertTrue(result.meanTest.power >= HypothesisTesting.TARGET_POWER)
        assertTrue(theoreticalMean in result.meanTest.confidenceInterval)
    }

    @Test
    fun `desvio grande e detectado como significativo`() {
        // média deslocada para 1,2 acerto com dispersão realista
        val random = Random(7)
        val series = List(1_000) { sampleHits(random) + 0.6 }

        val result = evaluate(series, distribution = observed(series.map { it - 0.6 }))

        assertEquals(Verdict.DESVIO_SIGNIFICATIVO, result.verdict)
        assertTrue(result.meanTest.pValue < 1e-6)
        assertFalse(theoreticalMean in result.meanTest.confidenceInterval)
    }

    @Test
    fun `amostra pequena reporta insuficiencia em vez de compatibilidade`() {
        // 20 concursos: erro padrão ~0,157, poder muito abaixo de 80%
        val random = Random(1)
        val series = List(20) { sampleHits(random).toDouble() }

        val result = evaluate(series, distribution = observed(series))

        assertEquals(Verdict.AMOSTRA_INSUFICIENTE, result.verdict)
        assertTrue(result.meanTest.power < HypothesisTesting.TARGET_POWER)
        // valor-p não é significativo, mas isso não autoriza concluir nada
        assertTrue(result.meanTest.pValue > 0.05)
    }

    @Test
    fun `erro padrao e intervalo seguem as formulas classicas`() {
        val series = listOf(0.0, 1.0, 0.0, 2.0, 1.0, 0.0, 1.0, 0.0)
        val result = evaluate(series)
        val test = result.meanTest

        val n = series.size
        val mean = series.average()
        val sampleVar = series.sumOf { (it - mean) * (it - mean) } / (n - 1)
        val se = sqrt(sampleVar) / sqrt(n.toDouble())

        assertEquals(mean, test.observedMean, 1e-12)
        assertEquals(sqrt(sampleVar), test.sampleStdDeviation, 1e-12)
        assertEquals(se, test.standardError, 1e-12)
        assertEquals((mean - theoreticalMean) / se, test.zScore, 1e-12)
        // IC 95% = média ± 1,959964·EP
        assertEquals(mean - 1.959963985 * se, test.confidenceInterval.lower, 1e-8)
        assertEquals(mean + 1.959963985 * se, test.confidenceInterval.upper, 1e-8)
        assertEquals(n, test.sampleSize)
    }

    @Test
    fun `menor efeito detectavel decresce com a raiz do n`() {
        val random = Random(99)
        val small = evaluate(List(100) { sampleHits(random).toDouble() }).meanTest
        val large = evaluate(List(10_000) { sampleHits(random).toDouble() }).meanTest

        assertTrue(large.minimumDetectableEffect < small.minimumDetectableEffect)
        // reduzir n por 100 amplia o efeito detectável por ~10
        val ratio = small.minimumDetectableEffect / large.minimumDetectableEffect
        assertTrue("razao $ratio", ratio in 8.0..12.0)
    }

    @Test
    fun `bonferroni endurece o criterio ao comparar estrategias`() {
        val random = Random(5)
        val series = List(2_000) { sampleHits(random) + 0.045 }
        val distribution = observed(series.map { it - 0.045 })

        val single = evaluate(series, distribution, comparisons = 1)
        val multiple = evaluate(series, distribution, comparisons = 10)

        assertEquals(0.05, single.significanceLevel, 1e-12)
        assertEquals(0.005, multiple.significanceLevel, 1e-12)
        // o valor-p não muda; o limiar sim, e o IC fica mais largo
        assertEquals(single.meanTest.pValue, multiple.meanTest.pValue, 1e-12)
        assertTrue(
            multiple.meanTest.confidenceInterval.upper >
                single.meanTest.confidenceInterval.upper,
        )
    }

    @Test
    fun `serie constante e tratada como estimador degenerado`() {
        // lote que cobre todo o universo fixa a soma de acertos: média constante
        val series = List(50) { 0.6 }
        val result = evaluate(series)

        assertTrue(result.meanTest.degenerateEstimator)
        // o erro padrão é ruído de ponto flutuante, não dispersão real
        assertEquals(0.0, result.meanTest.standardError, 1e-12)
        // o z não é calculado dividindo por esse ruído: sem essa proteção o
        // z explodiria e o teste acusaria um desvio significativo inexistente
        assertEquals(0.0, result.meanTest.zScore, 0.0)
        assertEquals(1.0, result.meanTest.pValue, 1e-12)
        assertEquals(0.0, result.meanTest.power, 0.0)
        assertEquals(0.0, result.meanTest.minimumDetectableEffect, 0.0)
        // média idêntica à teórica, mas o desenho não permite concluir
        assertEquals(Verdict.AMOSTRA_INSUFICIENTE, result.verdict)
    }

    @Test
    fun `qui-quadrado so e aplicavel com um jogo por concurso`() {
        val random = Random(3)
        val series = List(3_000) { sampleHits(random).toDouble() }
        val distribution = observed(series)

        assertTrue(evaluate(series, distribution, gamesPerContest = 1).goodnessOfFit.applicable)
        assertFalse(evaluate(series, distribution, gamesPerContest = 5).goodnessOfFit.applicable)
    }

    @Test
    fun `qui-quadrado agrupa categorias raras e mantem os graus de liberdade`() {
        val random = Random(11)
        val series = List(1_000) { sampleHits(random).toDouble() }
        val gof = evaluate(series, observed(series)).goodnessOfFit

        // com 1.000 jogos, esperados: 516 / 379 / 95 / 9,9 / 0,43 / ... -> agrupa a cauda
        assertTrue(gof.categories.any { it.label.startsWith("≥") })
        gof.categories.forEach { assertTrue("${it.label}=${it.expected}", it.expected > 0.0) }
        assertEquals(gof.categories.size - 1, gof.degreesOfFreedom)
        assertEquals(1_000, gof.categories.sumOf { it.observed })
        assertEquals(1_000.0, gof.categories.sumOf { it.expected }, 1e-9)
    }

    @Test
    fun `qui-quadrado detecta distorcao na forma da distribuicao`() {
        val series = List(1_000) { 0.6 }
        // distribuição uniforme entre 0 e 3 acertos: forma incompatível
        val distorted = mapOf(0 to 250, 1 to 250, 2 to 250, 3 to 250)
        val result = evaluate(series, distorted, gamesPerContest = 1)

        assertTrue(result.goodnessOfFit.statistic > 100.0)
        assertTrue(result.goodnessOfFit.pValue < 1e-10)
        assertEquals(Verdict.DESVIO_SIGNIFICATIVO, result.verdict)
    }

    @Test
    fun `numero de comparacoes invalido e rejeitado`() {
        val error = runCatching { evaluate(listOf(0.0, 1.0), comparisons = 0) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    /** Sorteia acertos conforme a hipergeométrica exata da Mega-Sena. */
    private fun sampleHits(random: Random): Int {
        val u = random.nextDouble()
        var acc = 0.0
        for (k in 0..6) {
            acc += theoretical.getValue(k)
            if (u <= acc) return k
        }
        return 6
    }

    private fun observed(series: List<Double>): Map<Int, Int> =
        series.map { Math.round(it).toInt() }.groupingBy { it }.eachCount()
}
