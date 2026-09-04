package com.volanteplus.loterias.domain.backtest

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * Funções especiais necessárias para inferência estatística, implementadas
 * sem dependências externas (o app não embarca biblioteca científica).
 *
 * Precisão alvo: ~1e-12 relativo, suficiente para valores-p de relatório.
 */
object SpecialFunctions {

    /** Constantes de Lanczos (g = 7, n = 9) para ln Γ(x). */
    private val LANCZOS = doubleArrayOf(
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    )

    /** ln Γ(x) para x > 0 (aproximação de Lanczos). */
    fun lnGamma(x: Double): Double {
        require(x > 0.0) { "lnGamma exige x > 0 (recebido $x)" }
        if (x < 0.5) {
            // reflexão: Γ(x)Γ(1-x) = π / sin(πx)
            return ln(Math.PI / kotlin.math.sin(Math.PI * x)) - lnGamma(1.0 - x)
        }
        val z = x - 1.0
        var acc = LANCZOS[0]
        for (i in 1 until LANCZOS.size) {
            acc += LANCZOS[i] / (z + i)
        }
        val t = z + 7.5
        return 0.5 * ln(2 * Math.PI) + (z + 0.5) * ln(t) - t + ln(acc)
    }

    /** ln do coeficiente binomial C(n, k), estável para n grande. */
    fun lnBinomial(n: Int, k: Int): Double {
        require(n >= 0 && k >= 0 && k <= n) { "C($n,$k) inválido" }
        if (k == 0 || k == n) return 0.0
        return lnGamma((n + 1).toDouble()) -
            lnGamma((k + 1).toDouble()) -
            lnGamma((n - k + 1).toDouble())
    }

    /**
     * Função de distribuição acumulada da normal padrão.
     *
     * Usa a forma complementar da função erro por fração contínua de Lentz,
     * mantendo precisão nas caudas (onde ficam os valores-p relevantes).
     */
    fun normalCdf(z: Double): Double = 0.5 * erfc(-z / sqrt(2.0))

    /** Função erro complementar. */
    fun erfc(x: Double): Double {
        if (x < 0.0) return 2.0 - erfc(-x)
        if (x == 0.0) return 1.0
        // erfc(x) = Γ(1/2, x²) / √π  -> usa a incompleta superior regularizada
        return regularizedGammaQ(0.5, x * x)
    }

    /**
     * P(a, x): função gama incompleta inferior regularizada.
     * P(a,x) + Q(a,x) = 1.
     */
    fun regularizedGammaP(a: Double, x: Double): Double {
        require(a > 0.0 && x >= 0.0) { "gamaP inválida: a=$a x=$x" }
        if (x == 0.0) return 0.0
        return if (x < a + 1.0) gammaSeries(a, x) else 1.0 - gammaContinuedFraction(a, x)
    }

    /** Q(a, x): função gama incompleta superior regularizada. */
    fun regularizedGammaQ(a: Double, x: Double): Double = 1.0 - regularizedGammaP(a, x)

    /** Representação em série de P(a,x), convergente para x < a+1. */
    private fun gammaSeries(a: Double, x: Double): Double {
        var ap = a
        var sum = 1.0 / a
        var term = sum
        for (n in 1..MAX_ITERATIONS) {
            ap += 1.0
            term *= x / ap
            sum += term
            if (abs(term) < abs(sum) * EPSILON) break
        }
        return sum * exp(-x + a * ln(x) - lnGamma(a))
    }

    /** Fração contínua de Q(a,x) (Lentz modificado), convergente para x >= a+1. */
    private fun gammaContinuedFraction(a: Double, x: Double): Double {
        var b = x + 1.0 - a
        var c = 1.0 / TINY
        var d = 1.0 / b
        var h = d
        for (i in 1..MAX_ITERATIONS) {
            val an = -i * (i - a)
            b += 2.0
            d = an * d + b
            if (abs(d) < TINY) d = TINY
            c = b + an / c
            if (abs(c) < TINY) c = TINY
            d = 1.0 / d
            val delta = d * c
            h *= delta
            if (abs(delta - 1.0) < EPSILON) break
        }
        return exp(-x + a * ln(x) - lnGamma(a)) * h
    }

    /**
     * Cauda superior da qui-quadrado: P(X² > statistic) com [degreesOfFreedom].
     * É o valor-p do teste de aderência.
     */
    fun chiSquareUpperTail(statistic: Double, degreesOfFreedom: Int): Double {
        require(degreesOfFreedom > 0) { "Graus de liberdade devem ser > 0" }
        if (statistic <= 0.0) return 1.0
        return regularizedGammaQ(degreesOfFreedom / 2.0, statistic / 2.0)
    }

    /** Quantil z da normal padrão (inversa da CDF), via Acklam + refino de Halley. */
    fun normalQuantile(p: Double): Double {
        require(p > 0.0 && p < 1.0) { "Quantil exige 0 < p < 1 (recebido $p)" }
        val a = doubleArrayOf(
            -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
            1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00,
        )
        val b = doubleArrayOf(
            -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
            6.680131188771972e+01, -1.328068155288572e+01,
        )
        val c = doubleArrayOf(
            -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
            -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00,
        )
        val d = doubleArrayOf(
            7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
            3.754408661907416e+00,
        )
        val pLow = 0.02425
        val pHigh = 1.0 - pLow

        var x = when {
            p < pLow -> {
                val q = sqrt(-2.0 * ln(p))
                (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
            }

            p <= pHigh -> {
                val q = p - 0.5
                val r = q * q
                (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
                    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
            }

            else -> {
                val q = sqrt(-2.0 * ln(1.0 - p))
                -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0)
            }
        }
        // um passo de Halley para levar o erro a ~1e-15
        val e = normalCdf(x) - p
        val u = e * sqrt(2.0 * Math.PI) * exp(x * x / 2.0)
        x -= u / (1.0 + x * u / 2.0)
        return x
    }

    private const val EPSILON = 1e-15
    private const val TINY = 1e-300
    private const val MAX_ITERATIONS = 1000
}
