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

    /**
     * Fatia do valor destinado à premiação, rateada entre os acertadores.
     *
     * A fração é relativa à base declarada em [ShareBase] pela loteria — as
     * duas loterias normalizam seus percentuais de formas diferentes, e
     * tratá-las como se fossem a mesma coisa era exatamente o defeito que
     * fazia o modelo pagar mais prêmio do que existe (ver [ShareBase]).
     */
    data class Share(val fraction: Double) : Payout
}

/**
 * Sobre o que incidem as frações de [Payout.Share] de cada loteria.
 *
 * ## O bug que este tipo elimina
 * As duas loterias publicam percentuais com normalizações diferentes:
 *
 * - Mega-Sena: 40% sena + 13% quina + 15% quadra são frações **do prêmio
 *   bruto**, e somam 0,68 — os 32% restantes (22% final 0/5 + 10% Virada)
 *   acumulam para concursos futuros.
 * - +Milionária: 62% + 10% + 8% + 8% + 6% + 6% somam **1,00**, porque são
 *   frações do que sobra depois de pagos os prêmios fixos das faixas 7 a 10
 *   e separada a reserva.
 *
 * O modelo anterior aplicava as duas listas ao prêmio bruto sem distinção e
 * ainda somava os prêmios fixos por cima. Na +Milionária isso dava R$ 3,3825
 * de prêmio esperado para um bolo de R$ 2,6010 por aposta: **30% a mais do
 * que existe para pagar**. Um laboratório que existe para refutar contas
 * erradas sobre loteria não pode violar conservação na sua própria tabela.
 */
enum class ShareBase {
    /** Frações do prêmio bruto; o complemento acumula (Mega-Sena). */
    GROSS_PRIZE,

    /** Frações do que resta após prêmios fixos e reserva (+Milionária). */
    NET_OF_FIXED_AND_RESERVE,
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
    /** Sobre o que incidem as frações das faixas de rateio. */
    val shareBase: ShareBase,
    /** Fração do bolo de rateio retida como reserva (não paga neste concurso). */
    val reserveShare: Double,
    /**
     * Retorno esperado exato das faixas de valor fixo. Único componente
     * calculável em reais sem depender do rateio — probabilidade × valor.
     */
    val fixedTierReturn: Double,
    /** Retorno esperado somado de todas as faixas de rateio, em reais. */
    val shareTierReturn: Double,
    val tiers: List<PrizeTier>,
) {
    /** Retorno esperado de longo prazo, em reais por aposta. */
    val longRunReturn: Double get() = betPrice * prizeShareOfCollection

    /**
     * Retorno esperado pago aos acertadores **deste** concurso.
     *
     * É a soma do que cada faixa efetivamente entrega, não uma fração
     * arbitrada do bolo — por construção nunca excede [longRunReturn], e o
     * que sobra é exatamente o que acumula (Mega-Sena) ou vai para a reserva
     * (+Milionária).
     */
    val immediateReturn: Double get() = fixedTierReturn + shareTierReturn

    /** Fração do prêmio bruto efetivamente paga neste concurso. */
    val immediateShareOfPrize: Double
        get() = if (longRunReturn <= 0.0) 0.0 else immediateReturn / longRunReturn

    /** Parte do prêmio bruto que não é paga agora: acumula ou vira reserva. */
    val deferredReturn: Double get() = longRunReturn - immediateReturn

    /** Perda esperada por aposta, em reais. Sempre positiva. */
    val expectedLoss: Double get() = betPrice - longRunReturn

    /** Perda esperada como fração do valor apostado (0,5665 = −56,65%). */
    val houseEdge: Double get() = 1.0 - prizeShareOfCollection

    /** Probabilidade de a aposta ser premiada em qualquer faixa. */
    val prizeProbability: Double get() = tiers.sumOf { it.probability }

    /** Perda esperada acumulada em [bets] apostas, em reais. */
    fun expectedLossFor(bets: Int): Double = expectedLoss * bets

    init {
        // Conservação: o modelo não pode distribuir mais prêmio do que existe.
        // Esta é a invariante que o modelo anterior violava em 30% na
        // +Milionária; deixá-la como `require` garante que nenhuma revisão
        // futura dos percentuais reintroduza o erro sem o build acusar.
        require(immediateReturn <= longRunReturn + CONSERVATION_TOLERANCE) {
            "Modelo de prêmios de $lottery paga R$ %.4f por aposta, acima do bolo de R$ %.4f"
                .format(immediateReturn, longRunReturn)
        }
    }

    companion object {
        /** Folga numérica para a checagem de conservação (centésimo de centavo). */
        const val CONSERVATION_TOLERANCE = 1e-4
    }
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

    /** Como cada loteria normaliza as frações das suas faixas de rateio. */
    fun shareBase(lottery: Lottery): ShareBase = when (lottery) {
        Lottery.MEGA_SENA -> ShareBase.GROSS_PRIZE
        Lottery.MAIS_MILIONARIA -> ShareBase.NET_OF_FIXED_AND_RESERVE
    }

    /** Fração do bolo de rateio retida como reserva e não paga neste concurso. */
    fun reserveShare(lottery: Lottery): Double = when (lottery) {
        // Na Mega-Sena o que não é pago agora não é "reserva": são as faixas
        // de acúmulo (22% final 0/5 + 10% Virada), já ausentes da lista de
        // faixas — o complemento sai naturalmente da soma das frações.
        Lottery.MEGA_SENA -> 0.0
        Lottery.MAIS_MILIONARIA -> MILIONARIA_RESERVE_SHARE
    }

    /**
     * Retorno esperado de uma aposta simples.
     *
     * ## Ordem de dedução (a correção)
     * O bolo bruto por aposta é `preço × 43,35%`. Dele saem, nesta ordem:
     *
     * 1. os prêmios de valor fixo (faixas 7 a 10 da +Milionária), pelo seu
     *    valor esperado exato `Σ P(faixa) × valor`;
     * 2. a reserva, quando existe, sobre o que restou;
     * 3. o restante, rateado entre as faixas conforme suas frações.
     *
     * Aplicar as frações ao bolo **bruto** e ainda somar os prêmios fixos por
     * cima — o que o modelo anterior fazia — distribuía 130% do bolo da
     * +Milionária. A ordem acima é a única leitura das duas listas de
     * percentuais que respeita conservação, e [ExpectedReturn] a verifica em
     * tempo de construção.
     */
    fun expectedReturn(lottery: Lottery): ExpectedReturn {
        val tiers = tiers(lottery)
        val gross = betPrice(lottery) * PRIZE_SHARE_OF_COLLECTION
        val fixed = tiers.sumOf { tier ->
            when (val payout = tier.payout) {
                is Payout.Fixed -> tier.probability * payout.amount
                is Payout.Share -> 0.0
            }
        }
        val base = shareBase(lottery)
        val reserve = reserveShare(lottery)
        // Base sobre a qual as frações de rateio incidem.
        val shareablePool = when (base) {
            ShareBase.GROSS_PRIZE -> gross
            ShareBase.NET_OF_FIXED_AND_RESERVE -> (gross - fixed).coerceAtLeast(0.0) * (1.0 - reserve)
        }
        val shared = tiers.sumOf { tier ->
            when (val payout = tier.payout) {
                is Payout.Share -> shareablePool * payout.fraction
                is Payout.Fixed -> 0.0
            }
        }
        return ExpectedReturn(
            lottery = lottery,
            betPrice = betPrice(lottery),
            prizeShareOfCollection = PRIZE_SHARE_OF_COLLECTION,
            shareBase = base,
            reserveShare = reserve,
            fixedTierReturn = fixed,
            shareTierReturn = shared,
            tiers = tiers,
        )
    }

    /**
     * Bolo por aposta sobre o qual as frações de rateio de [lottery] incidem.
     * Exposto porque [AccumulatedReturn] precisa da mesma base para não
     * reintroduzir a inconsistência ao estimar o concurso corrente.
     */
    fun shareablePoolPerBet(lottery: Lottery): Double {
        val er = expectedReturn(lottery)
        return when (er.shareBase) {
            ShareBase.GROSS_PRIZE -> er.longRunReturn
            ShareBase.NET_OF_FIXED_AND_RESERVE ->
                (er.longRunReturn - er.fixedTierReturn).coerceAtLeast(0.0) * (1.0 - er.reserveShare)
        }
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
