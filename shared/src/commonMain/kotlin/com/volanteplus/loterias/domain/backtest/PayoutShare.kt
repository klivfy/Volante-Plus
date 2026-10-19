package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.generator.Unpopularity
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.Lottery
import kotlin.math.exp
import kotlin.math.expm1
import kotlin.math.ln1p
import kotlin.math.roundToInt

/**
 * A única alavanca que a matemática deixa de pé numa loteria — e a sua
 * medida exata.
 *
 * ## O argumento, em três passos
 *
 * **1. A chance de acertar é intocável.** [Hypergeometric] mostra que
 * `E[acertos] = K·n/N` não depende de quais dezenas foram marcadas. Duas
 * apostas simples quaisquer — a mais "quente" e a mais "fria" — têm
 * *exatamente* a mesma probabilidade de cair em cada faixa. Nenhum
 * algoritmo, histórico ou padrão altera isso, porque sorteios são
 * independentes. Este módulo não tenta e não pode mexer aqui.
 *
 * **2. O retorno esperado incondicional também é intocável.**
 * [PrizeTable] mostra que a fração da arrecadação que vira prêmio é fixada
 * em norma, antes de qualquer sorteio. O teto é o mesmo para todo mundo.
 *
 * **3. Sobra exatamente uma coisa.** O prêmio das faixas de rateio é um
 * *bolo dividido entre os acertadores*. Se você acerta sozinho, leva o bolo;
 * se acerta junto com outros nove, leva um décimo. E **com quantas pessoas
 * você divide depende das dezenas que você marcou**, porque as pessoas não
 * escolhem ao acaso ([Unpopularity] documenta os vieses medidos). Logo:
 *
 * > Entre duas apostas com a mesma probabilidade de ganhar — e todas têm —
 * > a menos popular tem maior valor esperado **condicional a ganhar**.
 * > A escolha é de graça: não custa nada e não reduz chance nenhuma.
 *
 * Isso não é palpite nem promessa de ganho. É a consequência aritmética de
 * dividir um bolo fixo entre um número variável de pessoas.
 *
 * ## A fórmula
 * Seja `q` a probabilidade de **outro** apostador marcar exatamente a sua
 * combinação e `N` o número de apostas do concurso. Os demais acertadores da
 * sua combinação são `K ~ Binomial(N−1, q)`, e você recebe `bolo / (1+K)`:
 *
 * ```
 * E[1/(1+K)] = (1 − (1−q)^N) / (N·q)  ≡  crowding(q, N)
 * ```
 *
 * (mesma identidade demonstrada em [AccumulatedReturn], aqui aplicada à
 * concorrência pela sua combinação em vez de à existência de algum ganhador).
 *
 * `crowding` vale 1 quando ninguém mais joga a sua combinação e cai conforme
 * ela fica popular. O ganho de escolher uma combinação com popularidade
 * relativa `m` em vez da média é exatamente
 *
 * ```
 * ganho = crowding(m·q₀, N) / crowding(q₀, N) − 1,   q₀ = 1/C
 * ```
 *
 * com `C` = número de combinações distintas.
 *
 * ## O que é medido e o que é heurístico
 * - `crowding`, `q₀`, `C`, o efeito sobre o rateio: **exatos**, derivados
 *   acima e verificáveis por simulação.
 * - `m`, a popularidade relativa de uma combinação concreta: **heurístico**.
 *   Vem de [Unpopularity], cuja direção a literatura sustenta mas cuja
 *   magnitude no Brasil ninguém pode calibrar — a Caixa não publica a
 *   distribuição de dezenas apostadas. Ver [POPULARITY_ELASTICITY].
 *
 * A honestidade aqui é o produto: separar o que é teorema do que é
 * estimativa é o que distingue este laboratório de um gerador de palpites.
 */
object PayoutShare {

    /**
     * Quanto a popularidade responde a um desvio-padrão de [Unpopularity].
     *
     * `m = exp(β · z)`, com `z` o escore padronizado da penalidade. Com
     * β = 0,35 uma combinação um desvio acima da média é disputada por 1,42×
     * mais gente, e uma um desvio abaixo, por 0,70×.
     *
     * WHY deste valor: é deliberadamente conservador. O efeito isolado mais
     * forte da literatura (preferência por datas, 21,0% contra 13,3%
     * esperados no Dutch Lotto — ver [Unpopularity]) implica razão ~1,6 para
     * uma única característica; β = 0,35 fica abaixo disso para a combinação
     * inteira. Preferimos subestimar o ganho a vendê-lo.
     */
    const val POPULARITY_ELASTICITY = 0.35

    /**
     * Fator de diluição: valor esperado de `1/(1+K)` com `K ~ Bin(N−1, q)`,
     * ou seja, a fração do bolo que sobra para você ao dividi-lo com quem
     * marcou a mesma combinação. Vale 1,0 quando você acerta sozinho.
     */
    fun crowdingFactor(selectionProbability: Double, tickets: Double): Double {
        require(selectionProbability in 0.0..1.0) {
            "Probabilidade de seleção inválida: $selectionProbability"
        }
        require(tickets >= 1.0) { "Número de apostas inválido: $tickets" }
        if (selectionProbability <= 0.0) return 1.0
        val expected = tickets * selectionProbability
        // (1 − (1−q)^N)/(N·q), estável para q ~ 1e-8 e N ~ 1e7.
        return -expm1(tickets * ln1p(-selectionProbability)) / expected
    }

    /** Probabilidade de uma aposta uniforme cair numa combinação específica. */
    fun uniformSelectionProbability(lottery: Lottery): Double =
        1.0 / AccumulatedReturn.distinctSimpleBets(lottery).toDouble()

    /**
     * Popularidade relativa de [numbers] frente à combinação média, a partir
     * do escore padronizado de [Unpopularity]. 1,0 = popularidade média.
     */
    fun relativePopularity(lottery: Lottery, numbers: List<Int>): Double {
        val reference = PopularityReference.of(lottery)
        val z = reference.standardize(Unpopularity.penalty(lottery, numbers))
        return exp(POPULARITY_ELASTICITY * z)
    }

    /**
     * Ganho percentual no valor esperado **condicional a ganhar** a faixa de
     * rateio, por jogar uma combinação de popularidade relativa
     * [relativePopularity] em vez da média.
     *
     * Positivo quando a combinação é menos popular que a média. Não altera —
     * e é impossível que altere — a probabilidade de ganhar.
     */
    fun conditionalPayoutGain(
        lottery: Lottery,
        relativePopularity: Double,
        tickets: Double,
    ): Double {
        require(relativePopularity > 0.0) { "Popularidade relativa inválida" }
        val q0 = uniformSelectionProbability(lottery)
        val baseline = crowdingFactor(q0, tickets)
        if (baseline <= 0.0) return 0.0
        val mine = crowdingFactor((q0 * relativePopularity).coerceAtMost(1.0), tickets)
        return mine / baseline - 1.0
    }

    /**
     * Avaliação completa de um jogo: quanto ele é popular e o que isso vale.
     * [tickets] é o número de apostas do concurso (arrecadação / preço).
     */
    fun evaluate(lottery: Lottery, numbers: List<Int>, tickets: Double): Assessment {
        val m = relativePopularity(lottery, numbers)
        val q0 = uniformSelectionProbability(lottery)
        return Assessment(
            lottery = lottery,
            numbers = numbers.sorted(),
            penalty = Unpopularity.penalty(lottery, numbers),
            relativePopularity = m,
            tickets = tickets,
            crowding = crowdingFactor((q0 * m).coerceAtMost(1.0), tickets),
            baselineCrowding = crowdingFactor(q0, tickets),
            conditionalGain = conditionalPayoutGain(lottery, m, tickets),
            rateioProbabilityShare = rateioProbabilityShare(lottery),
        )
    }

    /**
     * Fração da probabilidade de "qualquer prêmio" que vem de faixas de
     * **rateio** (não fixas) — as únicas em que a popularidade importa. 1,0 na
     * Mega-Sena; ~0,01 na +Milionária (as faixas 7–10, de prêmio fixo,
     * concentram 99% dos casos de prêmio). Espelha o web `payoutShare.ts`
     * (spec 003, FR-005).
     */
    fun rateioProbabilityShare(lottery: Lottery): Double {
        val tiers = PrizeTable.tiers(lottery)
        val total = tiers.sumOf { it.probability }
        if (total <= 0.0) return 1.0
        val rateio = tiers.filter { it.payout is PrizeTable.Payout.Share }.sumOf { it.probability }
        return rateio / total
    }

    /** O que se sabe sobre um jogo depois de medido. Nada aqui é previsão. */
    data class Assessment(
        val lottery: Lottery,
        val numbers: List<Int>,
        /** Escore bruto de [Unpopularity]; maior = mais popular. */
        val penalty: Double,
        /** Popularidade relativa à combinação média (1,0 = média). */
        val relativePopularity: Double,
        val tickets: Double,
        /** Fração do bolo que sobra para este jogo ao dividi-lo. */
        val crowding: Double,
        /** O mesmo fator para uma combinação de popularidade média. */
        val baselineCrowding: Double,
        /** Ganho no valor esperado condicional a ganhar, frente à média. */
        val conditionalGain: Double,
        /**
         * Fração da probabilidade de prêmio em faixas de **rateio** — as
         * únicas em que a popularidade importa (ver [rateioProbabilityShare]).
         */
        val rateioProbabilityShare: Double,
    ) {
        /** true quando o jogo é menos disputado que a combinação média. */
        val betterThanAverage: Boolean get() = relativePopularity < 1.0

        /**
         * A frase que a interface deve exibir — inclui a ressalva, sempre.
         * Sem ela o número vira promessa, que é o que este app existe para
         * não fazer.
         *
         * WHY (qualificação por faixa): na +Milionária, 99% da probabilidade
         * de prêmio está nas faixas 7–10, de valor fixo — onde a popularidade
         * não muda nada. O ganho vale só sobre as faixas de rateio, e a frase
         * diz isso; sem a qualificação, o app venderia um ganho maior que o
         * real.
         */
        val summary: String
            get() {
                val pct = conditionalGain * 100
                val direction = if (pct >= 0) "a mais" else "a menos"
                val base = "%.1f%% %s de prêmio nas faixas de rateio se ganhar, " +
                    "pela mesma chance de ganhar.".format(kotlin.math.abs(pct), direction)
                if (rateioProbabilityShare >= 1.0 - 1e-12) return base
                val fixedPct = ((1.0 - rateioProbabilityShare) * 100).roundToInt()
                return "$base As faixas de prêmio fixo — $fixedPct% dos casos de " +
                    "prêmio — não mudam em nada."
            }
    }

    /**
     * Avaliação de um lote inteiro. [tickets] vem da arrecadação informada
     * pela API; sem ela a interface não deve exibir ganho nenhum, porque o
     * efeito do rateio depende de quantas pessoas estão jogando.
     */
    fun evaluateBatch(batch: GameBatch, tickets: Double): BatchAssessment {
        val games = batch.games.map { evaluate(batch.lottery, it.numbers, tickets) }
        return BatchAssessment(lottery = batch.lottery, games = games, tickets = tickets)
    }

    /** O lote medido. Os campos agregados são médias simples entre os jogos. */
    data class BatchAssessment(
        val lottery: Lottery,
        val games: List<Assessment>,
        val tickets: Double,
    ) {
        val averageRelativePopularity: Double
            get() = if (games.isEmpty()) 1.0 else games.map { it.relativePopularity }.average()

        /** Ganho médio no valor esperado condicional a ganhar. */
        val averageConditionalGain: Double
            get() = if (games.isEmpty()) 0.0 else games.map { it.conditionalGain }.average()

        /** Quantos jogos do lote são menos disputados que a combinação média. */
        val betterThanAverageCount: Int get() = games.count { it.betterThanAverage }

        /**
         * A ressalva obrigatória. Nenhuma tela deve exibir
         * [averageConditionalGain] sem exibir também esta frase: o número é
         * real, mas mede outra coisa que não a chance de ganhar, e é fácil
         * confundir as duas.
         */
        val disclaimer: String
            get() = "Este número não é chance de ganhar — a chance é idêntica " +
                "para qualquer combinação e nada a altera. Ele mede quanto do " +
                "prêmio sobraria para você, por dividi-lo com menos gente."
    }

    /**
     * Média e desvio-padrão da penalidade de [Unpopularity] sobre combinações
     * uniformes — a régua que converte um escore bruto em posição relativa.
     *
     * WHY (determinístico): os momentos são obtidos por uma varredura de
     * Monte Carlo com semente fixa na primeira consulta e memorizados. Semente
     * fixa porque a régua precisa ser a mesma em toda execução: se ela variasse,
     * dois relatórios do mesmo jogo dariam números diferentes e a medida
     * deixaria de ser auditável.
     */
    internal class PopularityReference private constructor(
        val mean: Double,
        val stdDeviation: Double,
    ) {
        fun standardize(penalty: Double): Double =
            if (stdDeviation <= 0.0) 0.0 else (penalty - mean) / stdDeviation

        companion object {
            /** Amostras da varredura. 20 mil dá erro padrão da média ~0,4%. */
            const val SAMPLES = 20_000
            private const val SEED = 20260910L

            private val cache = HashMap<Lottery, PopularityReference>()

            @Synchronized
            fun of(lottery: Lottery): PopularityReference = cache.getOrPut(lottery) { build(lottery) }

            private fun build(lottery: Lottery): PopularityReference {
                val random = java.util.Random(SEED)
                val universe = lottery.numberRange.toList()
                val stats = Statistics.ofDoubles(
                    List(SAMPLES) {
                        val game = LinkedHashSet<Int>(GAME_SIZE)
                        while (game.size < GAME_SIZE) {
                            game += universe[random.nextInt(universe.size)]
                        }
                        Unpopularity.penalty(lottery, game.toList())
                    },
                )
                return PopularityReference(stats.mean, stats.sampleStdDeviation)
            }

            private const val GAME_SIZE = 6
        }
    }
}
