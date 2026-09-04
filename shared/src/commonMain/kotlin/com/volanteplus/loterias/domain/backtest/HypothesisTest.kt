package com.volanteplus.loterias.domain.backtest

import kotlin.math.abs
import kotlin.math.sqrt

/** Veredito do laboratório sobre a estratégia testada. */
enum class Verdict(val label: String, val explanation: String) {
    NAO_REFUTA_ALEATORIEDADE(
        "Compatível com o acaso",
        "O desvio observado está dentro do que o acaso produz. A estratégia " +
            "não se distingue do aleatório.",
    ),
    DESVIO_SIGNIFICATIVO(
        "Desvio estatisticamente significativo",
        "O desvio excede o que o acaso explicaria no nível adotado. Verifique " +
            "viés no gerador ou no histórico antes de concluir qualquer vantagem.",
    ),
    AMOSTRA_INSUFICIENTE(
        "Amostra insuficiente para concluir",
        "A janela de validação não tem poder estatístico para detectar o efeito " +
            "mínimo de interesse. Nenhuma conclusão pode ser tirada.",
    ),
}

/** Intervalo de confiança bilateral. */
data class ConfidenceInterval(val lower: Double, val upper: Double) {
    operator fun contains(value: Double): Boolean = value in lower..upper
}

/**
 * Teste z bilateral da média de acertos por concurso contra o valor teórico
 * exato da hipergeométrica.
 *
 * A unidade de observação é o **concurso**, não o jogo: os jogos de um mesmo
 * lote são disjuntos por construção (regra de repetição mínima do gerador) e,
 * portanto, negativamente correlacionados. Tratá-los como independentes
 * subestimava o erro padrão.
 */
data class MeanTest(
    /** Média das médias por concurso. */
    val observedMean: Double,
    /** E[acertos] exato da hipergeométrica. */
    val theoreticalMean: Double,
    /** Desvio padrão amostral da série por concurso (n−1). */
    val sampleStdDeviation: Double,
    /** Erro padrão da média: s/√n, com n = concursos de validação. */
    val standardError: Double,
    val zScore: Double,
    val pValue: Double,
    val confidenceInterval: ConfidenceInterval,
    /** Poder do teste para [MINIMUM_EFFECT_OF_INTEREST]. */
    val power: Double,
    /** Menor efeito detectável com o n disponível (α, poder 80%). */
    val minimumDetectableEffect: Double,
    /** Concursos independentes usados — o n estatístico honesto. */
    val sampleSize: Int,
    /**
     * true quando o desenho do lote torna a média determinística — ocorre
     * quando os jogos do lote cobrem todo o universo de dezenas (ex.: 10
     * jogos × 6 dezenas = 60 na Mega-Sena). Nesse caso a soma de acertos do
     * lote é constante e a métrica de média perde poder de discriminação.
     */
    val degenerateEstimator: Boolean,
)

/**
 * Teste qui-quadrado de aderência da distribuição observada de acertos
 * (0..6) contra a hipergeométrica exata. Mais sensível que a média isolada:
 * detecta desvios na **forma** da distribuição, não só no centro.
 */
data class GoodnessOfFitTest(
    val statistic: Double,
    val degreesOfFreedom: Int,
    val pValue: Double,
    /** Categorias após agrupar as de frequência esperada < 5. */
    val categories: List<Category>,
    /**
     * false quando há mais de um jogo por concurso: os jogos do lote são
     * dependentes e o teste ficaria anticonservador. Nesse caso o resultado
     * é apenas descritivo e o veredito é decidido pelo [MeanTest].
     */
    val applicable: Boolean,
) {
    data class Category(val label: String, val observed: Int, val expected: Double)
}

/**
 * Resultado completo da inferência, incluindo a correção para comparações
 * múltiplas quando o usuário confronta mais de uma estratégia.
 */
data class HypothesisTest(
    val meanTest: MeanTest,
    val goodnessOfFit: GoodnessOfFitTest,
    /** Nível de significância efetivamente aplicado (já com Bonferroni). */
    val significanceLevel: Double,
    /** Quantas comparações o nível acima corrige. */
    val comparisons: Int,
    val verdict: Verdict,
)

/**
 * Construção dos testes a partir dos resultados do backtest.
 *
 * Convenções metodológicas:
 * - α padrão de 5%, dividido por [comparisons] (Bonferroni) quando o usuário
 *   compara várias estratégias — sem isso, testar as 3 estratégias eleva a
 *   taxa de falso positivo de 5% para ~14%.
 * - Poder alvo de 80% para um efeito mínimo de interesse de 0,10 acerto por
 *   jogo; abaixo disso o veredito é [Verdict.AMOSTRA_INSUFICIENTE] em vez de
 *   "compatível com o acaso" — ausência de evidência não é evidência de
 *   ausência.
 */
object HypothesisTesting {

    const val DEFAULT_ALPHA = 0.05
    const val TARGET_POWER = 0.80
    /** Efeito mínimo de interesse, em acertos por jogo. */
    const val MINIMUM_EFFECT_OF_INTEREST = 0.10
    private const val MIN_EXPECTED_FREQUENCY = 5.0

    fun evaluate(
        /** Média de acertos por jogo em cada concurso de validação (independentes). */
        meanHitsPerContest: List<Double>,
        /** Distribuição agregada `acertos -> jogos`. */
        hitDistribution: Map<Int, Int>,
        /** Distribuição teórica exata `acertos -> probabilidade`. */
        theoreticalDistribution: Map<Int, Double>,
        theoreticalMean: Double,
        gamesPerContest: Int,
        alpha: Double = DEFAULT_ALPHA,
        comparisons: Int = 1,
    ): HypothesisTest {
        require(comparisons >= 1) { "Número de comparações deve ser >= 1" }
        val adjustedAlpha = alpha / comparisons

        val meanTest = meanTest(meanHitsPerContest, theoreticalMean, adjustedAlpha)
        val gof = goodnessOfFit(hitDistribution, theoreticalDistribution, gamesPerContest)

        return HypothesisTest(
            meanTest = meanTest,
            goodnessOfFit = gof,
            significanceLevel = adjustedAlpha,
            comparisons = comparisons,
            verdict = verdict(meanTest, gof, adjustedAlpha),
        )
    }

    private fun meanTest(
        series: List<Double>,
        theoreticalMean: Double,
        alpha: Double,
    ): MeanTest {
        val n = series.size
        val mean = if (n == 0) 0.0 else series.average()
        // variância amostral (n−1): estimador não viesado para inferência
        val sampleVariance = if (n < 2) {
            0.0
        } else {
            series.sumOf { (it - mean) * (it - mean) } / (n - 1)
        }
        val sd = sqrt(sampleVariance)
        val se = if (n < 2) 0.0 else sd / sqrt(n.toDouble())
        val degenerate = n >= 2 && sd < DEGENERATE_TOLERANCE

        val zCritical = if (alpha in 0.0..1.0 && alpha > 0.0) {
            SpecialFunctions.normalQuantile(1.0 - alpha / 2.0)
        } else {
            0.0
        }

        val z: Double
        val p: Double
        if (degenerate || se <= 0.0) {
            // Série constante: o desenho do lote fixou a média. O erro padrão
            // aqui não é zero exato, mas ruído de ponto flutuante (~1e-17):
            // dividir por ele produziria um z astronômico e um falso desvio
            // significativo. O teste z não se aplica a estimador degenerado.
            z = 0.0
            p = if (abs(mean - theoreticalMean) < DEGENERATE_TOLERANCE) 1.0 else 0.0
        } else {
            z = (mean - theoreticalMean) / se
            p = 2.0 * (1.0 - SpecialFunctions.normalCdf(abs(z)))
        }

        val zBeta = SpecialFunctions.normalQuantile(TARGET_POWER)
        val usableSe = !degenerate && se > 0.0
        val mde = if (usableSe) (zCritical + zBeta) * se else 0.0
        val power = if (usableSe) {
            val shift = MINIMUM_EFFECT_OF_INTEREST / se
            SpecialFunctions.normalCdf(shift - zCritical) +
                SpecialFunctions.normalCdf(-shift - zCritical)
        } else {
            0.0
        }

        return MeanTest(
            observedMean = mean,
            theoreticalMean = theoreticalMean,
            sampleStdDeviation = sd,
            standardError = se,
            zScore = z,
            pValue = p.coerceIn(0.0, 1.0),
            confidenceInterval = if (usableSe) {
                ConfidenceInterval(mean - zCritical * se, mean + zCritical * se)
            } else {
                // sem dispersão estimável, o intervalo colapsa no ponto observado
                ConfidenceInterval(mean, mean)
            },
            power = power.coerceIn(0.0, 1.0),
            minimumDetectableEffect = mde,
            sampleSize = n,
            degenerateEstimator = degenerate,
        )
    }

    /**
     * Agrupa as categorias de frequência esperada < 5 (a partir da cauda
     * superior, que é a rara) para satisfazer a premissa do qui-quadrado.
     */
    private fun goodnessOfFit(
        hitDistribution: Map<Int, Int>,
        theoretical: Map<Int, Double>,
        gamesPerContest: Int,
    ): GoodnessOfFitTest {
        val totalGames = hitDistribution.values.sum()
        val keys = theoretical.keys.sorted()

        val categories = mutableListOf<GoodnessOfFitTest.Category>()
        var pooledObserved = 0
        var pooledExpected = 0.0
        var pooledFrom: Int? = null

        for (k in keys) {
            val observed = hitDistribution[k] ?: 0
            val expected = (theoretical[k] ?: 0.0) * totalGames
            if (pooledFrom != null) {
                pooledObserved += observed
                pooledExpected += expected
                continue
            }
            if (expected < MIN_EXPECTED_FREQUENCY) {
                pooledFrom = k
                pooledObserved = observed
                pooledExpected = expected
            } else {
                categories += GoodnessOfFitTest.Category("$k", observed, expected)
            }
        }
        pooledFrom?.let { categories += GoodnessOfFitTest.Category("≥$it", pooledObserved, pooledExpected) }

        val usable = categories.filter { it.expected > 0.0 }
        val statistic = usable.sumOf { (it.observed - it.expected).let { d -> d * d } / it.expected }
        val df = (usable.size - 1).coerceAtLeast(1)
        val applicable = gamesPerContest == 1 && usable.size >= 2 && totalGames > 0

        return GoodnessOfFitTest(
            statistic = statistic,
            degreesOfFreedom = df,
            pValue = if (usable.size >= 2 && totalGames > 0) {
                SpecialFunctions.chiSquareUpperTail(statistic, df)
            } else {
                1.0
            },
            categories = categories,
            applicable = applicable,
        )
    }

    private fun verdict(
        meanTest: MeanTest,
        gof: GoodnessOfFitTest,
        alpha: Double,
    ): Verdict = when {
        meanTest.sampleSize < 2 -> Verdict.AMOSTRA_INSUFICIENTE
        meanTest.pValue < alpha -> Verdict.DESVIO_SIGNIFICATIVO
        gof.applicable && gof.pValue < alpha -> Verdict.DESVIO_SIGNIFICATIVO
        // o desenho fixou a média: a ausência de desvio não é informativa
        meanTest.degenerateEstimator -> Verdict.AMOSTRA_INSUFICIENTE
        meanTest.power < TARGET_POWER -> Verdict.AMOSTRA_INSUFICIENTE
        else -> Verdict.NAO_REFUTA_ALEATORIEDADE
    }

    private const val DEGENERATE_TOLERANCE = 1e-12
}
