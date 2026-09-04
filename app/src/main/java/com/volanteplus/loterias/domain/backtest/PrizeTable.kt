package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery

/**
 * Como cada faixa é paga.
 *
 * Loteria brasileira é **pari-mutuel**: salvo as faixas de valor fixo, o
 * prêmio não é um valor definido — é uma fatia de um bolo dividida entre os
 * acertadores daquele concurso. Por isso o retorno esperado de uma faixa de
 * rateio não depende de quanto ela "paga": depende de quanto do bolo ela
 * recebe. Modelar isso como valor fixo seria inventar número.
 */
sealed interface Payout {

    /** Prêmio de valor fixo em reais, definido em regulamento. */
    data class Fixed(val amount: Double) : Payout

    /** Fatia do valor destinado à premiação, rateada entre os acertadores. */
    data class Share(val fraction: Double) : Payout
}

/** Uma faixa oficial, com sua probabilidade exata e sua forma de pagamento. */
data class PrizeTier(
    val index: Int,
    val label: String,
    val numberHits: Int,
    /** Acertos de trevos aceitos; vazio na Mega-Sena. */
    val trevoHits: Set<Int>,
    /** Probabilidade exata de uma aposta simples cair nesta faixa. */
    val probability: Double,
    val payout: Payout,
) {
    /** "1 em N" — a forma que as pessoas entendem. */
    val oneIn: Double get() = if (probability <= 0.0) Double.POSITIVE_INFINITY else 1.0 / probability
}

/**
 * Retorno esperado de uma aposta simples, em reais.
 *
 * ## O resultado central
 * O percentual da arrecadação destinado à premiação é **fixado em norma**.
 * Ele não depende de quais dezenas você marca, de quantos jogos você faz nem
 * de qualquer estratégia. Logo:
 *
 * > O retorno esperado de qualquer aposta é negativo, e o mesmo para todas
 * > as estratégias. Nenhuma escolha de dezenas altera este número.
 *
 * Isso é mais forte que o teorema da invariância dos acertos: mesmo que uma
 * estratégia pudesse acertar mais (não pode), o teto de retorno seria o mesmo,
 * porque ele é definido antes de qualquer sorteio.
 *
 * ## Por que há dois números
 * [immediateReturn] considera só a parte do bolo paga aos acertadores **deste**
 * concurso. [longRunReturn] considera os 100% do bolo, porque o que fica
 * acumulado (final 0/5, Mega da Virada, reserva) volta a ser pago a apostadores
 * em concursos futuros. Em regime estacionário, [longRunReturn] é o número
 * honesto — e é o teto absoluto.
 */
data class ExpectedReturn(
    val lottery: Lottery,
    /** Preço da aposta simples, em reais. */
    val betPrice: Double,
    /** Fração da arrecadação que vira prêmio bruto (0,4335). */
    val prizeShareOfCollection: Double,
    /** Fração do prêmio bruto rateada já neste concurso. */
    val immediateShareOfPrize: Double,
    /**
     * Retorno esperado exato das faixas de valor fixo. Único componente
     * calculável em reais sem depender do rateio — probabilidade × valor.
     */
    val fixedTierReturn: Double,
    val tiers: List<PrizeTier>,
) {
    /** Retorno esperado de longo prazo, em reais por aposta. */
    val longRunReturn: Double get() = betPrice * prizeShareOfCollection

    /** Retorno esperado considerando só o rateio deste concurso. */
    val immediateReturn: Double get() = longRunReturn * immediateShareOfPrize

    /** Perda esperada por aposta, em reais. Sempre positiva. */
    val expectedLoss: Double get() = betPrice - longRunReturn

    /** Perda esperada como fração do valor apostado (0,5665 = −56,65%). */
    val houseEdge: Double get() = 1.0 - prizeShareOfCollection

    /** Probabilidade de a aposta ser premiada em qualquer faixa. */
    val prizeProbability: Double get() = tiers.sumOf { it.probability }

    /** Perda esperada acumulada em [bets] apostas, em reais. */
    fun expectedLossFor(bets: Int): Double = expectedLoss * bets
}

/**
 * Faixas, preços e percentuais oficiais das loterias suportadas.
 *
 * ## Fontes
 * - Portaria SPA/MF nº 1.656, de 29/07/2025, que alterou o Anexo à Portaria
 *   SEAE/ME nº 8.427/2022 e redistribuiu as faixas da Mega-Sena a partir do
 *   concurso 2.895: 40% sena, 13% quina, 15% quadra, 10% reserva da Mega da
 *   Virada. O inciso "d" (acumulado para concursos de final 0 ou 5) não foi
 *   alterado e permanece em 22% — os cinco itens somam exatamente 100%, o que
 *   confirma a leitura.
 *   https://www.legisweb.com.br/legislacao/?id=481817
 * - Prêmio bruto de 43,35% da arrecadação e preço da aposta simples de R$ 6,00.
 *   https://g1.globo.com/loterias/mega-sena/mega-sena-tudo-sobre-como-funciona-o-jogo-das-loterias-caixa.ghtml
 * - Faixas e valores fixos da +Milionária.
 *   https://g1.globo.com/loterias/milionaria/noticia/2024/09/10/mais-milionaria-tudo-sobre-como-funciona-o-jogo-das-loterias-caixa.ghtml
 *
 * ## Limitação declarada
 * Estes percentuais mudam por portaria. Se a norma mudar, os números aqui
 * ficam desatualizados até serem revisados — o app não busca a norma vigente
 * em tempo de execução. Preferimos um número auditável e datado a um número
 * que finge estar sempre correto.
 */
object PrizeTable {

    /** Data da última conferência dos percentuais contra as fontes acima. */
    const val REFERENCE_DATE = "2026-09-03"

    /** Fração da arrecadação destinada à premiação bruta, nas duas loterias. */
    const val PRIZE_SHARE_OF_COLLECTION = 0.4335

    /** Preço da aposta simples de 6 dezenas, em reais. */
    const val SIMPLE_BET_PRICE = 6.0

    fun betPrice(lottery: Lottery): Double = SIMPLE_BET_PRICE

    /**
     * Faixas com probabilidade exata já calculada por [Hypergeometric].
     * Ordenadas da faixa 1 (mais difícil) para a última.
     */
    fun tiers(lottery: Lottery): List<PrizeTier> {
        val dezenas = Hypergeometric.distributionFor(lottery)
        fun p(hits: Int, trevos: Set<Int>): Double {
            val pd = dezenas[hits] ?: 0.0
            return if (!lottery.hasTrevos) pd else pd * trevos.sumOf(Hypergeometric::trevoProbability)
        }
        return when (lottery) {
            Lottery.MEGA_SENA -> listOf(
                Triple("Sena (6 acertos)", 6, Payout.Share(MEGA_SENA_SHARE)),
                Triple("Quina (5 acertos)", 5, Payout.Share(MEGA_QUINA_SHARE)),
                Triple("Quadra (4 acertos)", 4, Payout.Share(MEGA_QUADRA_SHARE)),
            ).mapIndexed { i, (label, hits, payout) ->
                PrizeTier(i + 1, label, hits, emptySet(), p(hits, emptySet()), payout)
            }

            Lottery.MAIS_MILIONARIA -> MILIONARIA_TIERS.mapIndexed { i, spec ->
                PrizeTier(
                    index = i + 1,
                    label = spec.label,
                    numberHits = spec.numberHits,
                    trevoHits = spec.trevoHits,
                    probability = p(spec.numberHits, spec.trevoHits),
                    payout = spec.payout,
                )
            }
        }
    }

    /** Retorno esperado de uma aposta simples. */
    fun expectedReturn(lottery: Lottery): ExpectedReturn {
        val tiers = tiers(lottery)
        val fixed = tiers.sumOf { tier ->
            when (val payout = tier.payout) {
                is Payout.Fixed -> tier.probability * payout.amount
                is Payout.Share -> 0.0
            }
        }
        return ExpectedReturn(
            lottery = lottery,
            betPrice = betPrice(lottery),
            prizeShareOfCollection = PRIZE_SHARE_OF_COLLECTION,
            immediateShareOfPrize = when (lottery) {
                Lottery.MEGA_SENA -> MEGA_SENA_SHARE + MEGA_QUINA_SHARE + MEGA_QUADRA_SHARE
                Lottery.MAIS_MILIONARIA -> 1.0 - MILIONARIA_RESERVE_SHARE
            },
            fixedTierReturn = fixed,
            tiers = tiers,
        )
    }

    // ---- Mega-Sena: Portaria SPA/MF nº 1.656/2025 (concurso 2.895 em diante) ----

    private const val MEGA_SENA_SHARE = 0.40
    private const val MEGA_QUINA_SHARE = 0.13
    private const val MEGA_QUADRA_SHARE = 0.15

    /** 22% acumulam para os concursos de final 0 ou 5. */
    const val MEGA_ACCUMULATED_SHARE = 0.22

    /** 10% formam a reserva da Mega da Virada. */
    const val MEGA_VIRADA_SHARE = 0.10

    // ---- +Milionária ----

    /** 5% do prêmio bruto vão para a reserva garantidora. */
    private const val MILIONARIA_RESERVE_SHARE = 0.05

    private data class TierSpec(
        val label: String,
        val numberHits: Int,
        val trevoHits: Set<Int>,
        val payout: Payout,
    )

    private val MILIONARIA_TIERS = listOf(
        TierSpec("6 dezenas + 2 trevos", 6, setOf(2), Payout.Share(0.62)),
        TierSpec("6 dezenas + 1 ou 0 trevo", 6, setOf(1, 0), Payout.Share(0.10)),
        TierSpec("5 dezenas + 2 trevos", 5, setOf(2), Payout.Share(0.08)),
        TierSpec("5 dezenas + 1 ou 0 trevo", 5, setOf(1, 0), Payout.Share(0.08)),
        TierSpec("4 dezenas + 2 trevos", 4, setOf(2), Payout.Share(0.06)),
        TierSpec("4 dezenas + 1 ou 0 trevo", 4, setOf(1, 0), Payout.Share(0.06)),
        TierSpec("3 dezenas + 2 trevos", 3, setOf(2), Payout.Fixed(50.0)),
        TierSpec("3 dezenas + 1 trevo", 3, setOf(1), Payout.Fixed(24.0)),
        TierSpec("2 dezenas + 2 trevos", 2, setOf(2), Payout.Fixed(12.0)),
        TierSpec("2 dezenas + 1 trevo", 2, setOf(1), Payout.Fixed(6.0)),
    )
}
