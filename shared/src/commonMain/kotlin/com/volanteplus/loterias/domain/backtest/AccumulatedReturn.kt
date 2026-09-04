package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.ContestOutlook
import com.volanteplus.loterias.domain.model.Lottery
import kotlin.math.expm1
import kotlin.math.ln1p

/**
 * Retorno esperado de uma aposta simples **em um concurso específico**,
 * levando em conta o prêmio acumulado de concursos anteriores.
 *
 * ## Por que isto é matemática comprovada e não palpite
 * [PrizeTable.expectedReturn] mostra que, em regime estacionário, o retorno
 * esperado é fixado em norma e nenhuma escolha de dezenas o altera. Isso
 * continua verdadeiro. Mas o retorno de um concurso **particular** varia: quando
 * ninguém acerta a faixa principal, o dinheiro dela vai para o concurso
 * seguinte. Quem aposta no concurso seguinte disputa um bolo formado pela
 * arrecadação daquele concurso **mais** o acumulado — dinheiro que não saiu do
 * bolso de quem está apostando agora. O retorno esperado sobe. Foi exatamente
 * esta assimetria que Stefan Mandel explorou nos anos 1980-90 (só valia a pena
 * cobrir todas as combinações quando o acumulado superava o custo de cobri-las).
 *
 * ## O modelo
 * Seja N o número de apostas simples do concurso (arrecadação / preço), p₁ a
 * probabilidade de uma aposta acertar a faixa principal, A o acumulado e
 * F₁ a fração do prêmio bruto destinada à faixa principal. O bolo da faixa
 * principal é `N · preço · s · F₁ + A`, onde s é a fração da arrecadação que
 * vira prêmio. Ele é rateado entre os K acertadores, K ~ Binomial(N, p₁), e só
 * é pago se K ≥ 1. O valor esperado que **uma** aposta recebe desse bolo é
 *
 *     bolo · (1 − (1 − p₁)^N) / N
 *
 * Demonstração: condicional a minha aposta acertar (probabilidade p₁), divido
 * o bolo com K' ~ Binomial(N − 1, p₁) outros acertadores, e
 * E[1 / (1 + K')] = (1 − (1 − p₁)^N) / (N · p₁). Multiplicando por p₁ dá a
 * fórmula. Somando sobre as N apostas, o bolo é pago com probabilidade
 * 1 − (1 − p₁)^N — exatamente a probabilidade de haver ao menos um acertador,
 * o que confere.
 *
 * As faixas inferiores de rateio têm milhares de acertadores por concurso, de
 * modo que a probabilidade de o bolo delas ficar sem ninguém é desprezível:
 * são tratadas como sempre pagas. As faixas de valor fixo entram pelo produto
 * probabilidade × valor, como já faz [PrizeTable].
 *
 * ## Limitações declaradas
 * - N é estimado pela arrecadação do concurso **anterior**. Acumulado alto
 *   atrai mais apostas, então N real tende a ser maior e o bônus real, menor.
 *   O número exibido é, portanto, um teto otimista, não uma promessa.
 * - Na +Milionária os prêmios fixos são pagos antes da divisão percentual; a
 *   estimativa ignora essa dedução e superestima levemente as faixas de rateio.
 * - Concursos especiais (final 0/5, Mega da Virada) somam reservas adicionais
 *   ao bolo que a API não expõe neste campo; para eles o bônus real é maior.
 * - O acumulado muda **quando** apostar, nunca **o que** apostar. Nenhuma
 *   escolha de dezenas altera este número.
 */
object AccumulatedReturn {

    /**
     * Valor esperado que uma aposta recebe de um bolo [pool] rateado entre
     * acertadores de probabilidade [probability] cada, havendo [tickets]
     * apostas no concurso (incluindo a própria). Ver derivação acima.
     */
    fun expectedShareOfPool(pool: Double, probability: Double, tickets: Double): Double {
        require(pool >= 0.0) { "Bolo negativo: $pool" }
        require(probability in 0.0..1.0) { "Probabilidade inválida: $probability" }
        require(tickets >= 1.0) { "Número de apostas inválido: $tickets" }
        if (pool == 0.0 || probability == 0.0) return 0.0
        return pool * probabilityOfAnyWinner(probability, tickets) / tickets
    }

    /**
     * 1 − (1 − p)^N, calculado de forma numericamente estável para p da ordem
     * de 10⁻⁸ e N da ordem de 10⁷ (onde (1 − p)^N perderia precisão).
     */
    fun probabilityOfAnyWinner(probability: Double, tickets: Double): Double =
        -expm1(tickets * ln1p(-probability))

    /** Custo de cobrir todas as combinações simples — o limiar clássico de Mandel. */
    fun fullCoverageCost(lottery: Lottery): Double =
        distinctSimpleBets(lottery).toDouble() * PrizeTable.betPrice(lottery)

    /** Quantidade de apostas simples distintas da loteria. */
    fun distinctSimpleBets(lottery: Lottery): Long {
        val numbers = binomial(lottery.numberRange.count(), 6)
        val trevos = if (lottery.hasTrevos) {
            binomial(Lottery.TREVO_RANGE.count(), Lottery.TREVOS_REQUIRED)
        } else {
            1L
        }
        return numbers * trevos
    }

    /**
     * Estimativa para o próximo concurso descrito por [outlook], ou null quando
     * a API não informou a arrecadação (sem N não há rateio a calcular).
     */
    fun estimate(outlook: ContestOutlook): Estimate? {
        val lottery = outlook.lottery
        val base = PrizeTable.expectedReturn(lottery)
        val price = base.betPrice
        if (outlook.lastCollection <= 0.0) return null
        val tickets = maxOf(1.0, outlook.lastCollection / price)

        val topTier = base.tiers.first()
        val topFraction = (topTier.payout as? Payout.Share)?.fraction ?: 0.0
        val lowerShareFraction = base.tiers.drop(1).sumOf { tier ->
            (tier.payout as? Payout.Share)?.fraction ?: 0.0
        }

        val grossPrizePerBet = price * base.prizeShareOfCollection
        val topPoolFromCollection = tickets * grossPrizePerBet * topFraction
        val anyWinner = probabilityOfAnyWinner(topTier.probability, tickets)

        val topReturnWithoutAccumulated = topPoolFromCollection * anyWinner / tickets
        val accumulatedBonus =
            expectedShareOfPool(outlook.accumulatedForNext, topTier.probability, tickets)
        val lowerReturn = grossPrizePerBet * lowerShareFraction + base.fixedTierReturn

        val baseReturn = topReturnWithoutAccumulated + lowerReturn
        val breakEven = if (anyWinner > 0.0) {
            maxOf(0.0, (price - baseReturn) * tickets / anyWinner)
        } else {
            Double.POSITIVE_INFINITY
        }

        return Estimate(
            lottery = lottery,
            betPrice = price,
            tickets = tickets,
            topTierProbability = topTier.probability,
            probabilityOfAnyTopWinner = anyWinner,
            accumulated = outlook.accumulatedForNext,
            baseReturn = baseReturn,
            accumulatedBonus = accumulatedBonus,
            breakEvenAccumulated = breakEven,
            fullCoverageCost = fullCoverageCost(lottery),
        )
    }

    /** Resultado do modelo para um concurso. Todos os valores em reais. */
    data class Estimate(
        val lottery: Lottery,
        val betPrice: Double,
        /** Apostas simples estimadas no concurso (arrecadação anterior / preço). */
        val tickets: Double,
        val topTierProbability: Double,
        /** Probabilidade de a faixa principal ter ao menos um acertador. */
        val probabilityOfAnyTopWinner: Double,
        val accumulated: Double,
        /** Retorno esperado deste concurso se não houvesse acumulado. */
        val baseReturn: Double,
        /** Parcela do retorno esperado devida exclusivamente ao acumulado. */
        val accumulatedBonus: Double,
        /** Acumulado a partir do qual o retorno esperado igualaria o preço. */
        val breakEvenAccumulated: Double,
        /** Custo de cobrir todas as combinações (limiar de Mandel). */
        val fullCoverageCost: Double,
    ) {
        /** Retorno esperado total deste concurso, por aposta simples. */
        val totalReturn: Double get() = baseReturn + accumulatedBonus

        /** Retorno esperado como fração do preço (0,30 = recebe 30 centavos por real). */
        val returnRatio: Double get() = totalReturn / betPrice

        /** Fração do custo de cobertura total que o acumulado já paga. */
        val coverageRatio: Double get() = accumulated / fullCoverageCost

        /** true no caso, historicamente raro, de retorno esperado ≥ preço. */
        val isFavorable: Boolean get() = totalReturn >= betPrice
    }

    private fun binomial(n: Int, k: Int): Long {
        require(k in 0..n)
        var result = 1L
        for (i in 1..k) {
            result = result * (n - k + i) / i
        }
        return result
    }
}
