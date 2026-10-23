package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery
import kotlin.math.exp
import kotlin.math.sqrt

/**
 * Distribuição hipergeométrica exata dos acertos de um jogo.
 *
 * Sorteia-se [K] dezenas de um universo de [N]; o apostador marca [n]. O
 * número de acertos `X = |jogo ∩ sorteio|` segue:
 *
 * ```
 * P(X = k) = C(K,k) · C(N-K, n-k) / C(N,n)
 * ```
 *
 * **Teorema da invariância** — a esperança `E[X] = K·n/N` **não depende de
 * quais dezenas foram marcadas**. Ela é idêntica para as dezenas mais
 * frequentes, as menos frequentes ou um RNG criptográfico. Como os sorteios
 * são independentes, nenhuma informação do histórico altera a distribuição
 * do próximo concurso. Este objeto é, portanto, o baseline exato contra o
 * qual toda estratégia é confrontada — e substitui a estimativa por
 * simulação, que carregava ruído de Monte Carlo desnecessário.
 */
object Hypergeometric {

    /** P(X = k) para o cenário (N, K, n). */
    fun probability(N: Int, K: Int, n: Int, k: Int): Double {
        require(N > 0 && K in 0..N && n in 0..N) { "Parâmetros inválidos: N=$N K=$K n=$n" }
        if (k < maxOf(0, n - (N - K)) || k > minOf(n, K)) return 0.0
        val lnP = SpecialFunctions.lnBinomial(K, k) +
            SpecialFunctions.lnBinomial(N - K, n - k) -
            SpecialFunctions.lnBinomial(N, n)
        return exp(lnP)
    }

    /** E[X] = K·n/N — invariante à escolha das dezenas. */
    fun mean(N: Int, K: Int, n: Int): Double = K.toDouble() * n / N

    /** Var[X] = n·(K/N)·(1−K/N)·(N−n)/(N−1), com correção de população finita. */
    fun variance(N: Int, K: Int, n: Int): Double {
        require(N > 1) { "Variância exige N > 1" }
        val p = K.toDouble() / N
        return n * p * (1 - p) * (N - n).toDouble() / (N - 1)
    }

    fun stdDeviation(N: Int, K: Int, n: Int): Double = sqrt(variance(N, K, n))

    /** Distribuição completa `acertos -> probabilidade`, de 0 a min(n, K). */
    fun distribution(N: Int, K: Int, n: Int): Map<Int, Double> =
        (0..minOf(n, K)).associateWith { probability(N, K, n, it) }

    // ---- Atalhos para as loterias do app (jogo simples de 6 dezenas) ----

    /** Universo de dezenas da loteria. */
    private fun universe(lottery: Lottery): Int = lottery.numberRange.count()

    /** Distribuição exata dos acertos de um jogo simples em [lottery]. */
    fun distributionFor(lottery: Lottery): Map<Int, Double> =
        distribution(universe(lottery), lottery.numbersDrawn, lottery.numbersDrawn)

    /** E[acertos] de um jogo simples: 0,60 na Mega-Sena e 0,72 na +Milionária. */
    fun meanFor(lottery: Lottery): Double =
        mean(universe(lottery), lottery.numbersDrawn, lottery.numbersDrawn)

    /** Var[acertos] de um jogo simples. */
    fun varianceFor(lottery: Lottery): Double =
        variance(universe(lottery), lottery.numbersDrawn, lottery.numbersDrawn)

    fun stdDeviationFor(lottery: Lottery): Double = sqrt(varianceFor(lottery))

    /**
     * Probabilidade exata de uma aposta ser premiada, somando as faixas
     * oficiais de [PrizeRules] ponderadas pelas probabilidades de dezenas e,
     * na +Milionária, de trevos.
     */
    fun prizeProbabilityFor(lottery: Lottery): Double {
        val dezenas = distributionFor(lottery)
        return if (!lottery.hasTrevos) {
            dezenas.entries.sumOf { (hits, p) ->
                if (PrizeRules.isPrize(lottery, hits, trevoHits = 0)) p else 0.0
            }
        } else {
            dezenas.entries.sumOf { (hits, pDezenas) ->
                (0..Lottery.TREVOS_REQUIRED).sumOf { trevos ->
                    if (PrizeRules.isPrize(lottery, hits, trevos)) {
                        pDezenas * trevoProbability(trevos)
                    } else {
                        0.0
                    }
                }
            }
        }
    }

    /**
     * P(acertar [hits] trevos) apostando os 2 exigidos: hipergeométrica com
     * N=6 trevos disponíveis, K=2 sorteados, n=2 marcados.
     */
    fun trevoProbability(hits: Int): Double = probability(
        N = Lottery.TREVO_RANGE.count(),
        K = Lottery.TREVOS_REQUIRED,
        n = Lottery.TREVOS_REQUIRED,
        k = hits,
    )
}
