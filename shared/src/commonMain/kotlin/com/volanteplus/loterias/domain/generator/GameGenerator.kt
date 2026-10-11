package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.backtest.PerformanceTier
import com.volanteplus.loterias.domain.backtest.PayoutShare
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GeneratedGame
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import java.security.SecureRandom
import java.util.Random
import java.util.logging.Logger
import kotlin.math.ceil

/**
 * Gerador de lotes de jogos simples ([Draw.NUMBERS_DRAWN] dezenas).
 *
 * Fonte única de dados: a lista de [NumberPerformance] produzida pelo
 * `BacktestAnalyzer`. Não existem mais estratégias selecionáveis — todo lote
 * é [GameBatch.STRATEGY_LABEL].
 *
 * ALGORITMO
 * 1. As dezenas elegíveis são ordenadas por [NumberPerformance.weight] e
 *    fatiadas em três tiers por percentil: 40% TOP, 30% MID, 30% LOW.
 * 2. Cada vaga do jogo sorteia primeiro um tier ([TOP_TIER_SHARE] = 70%,
 *    [MID_TIER_SHARE] = 20%, o restante 10% para o LOW) e depois uma dezena
 *    *dentro* do tier, com probabilidade proporcional ao peso.
 * 3. Jogo repetido dentro do lote é resorteado até [MAX_DEDUP_ATTEMPTS]
 *    vezes; passando disso, o jogo é aceito com um aviso no log.
 * 4. **Desempate por rateio**: cada vaga do lote sorteia
 *    [PAYOUT_CANDIDATES] jogos pelo processo acima e fica com o menos
 *    popular segundo [PayoutShare]. Ver WHY abaixo.
 *
 * WHY (passo 4 — a única otimização que existe): pelo teorema da invariância,
 * todos os candidatos sorteados no passo 3 têm **exatamente** a mesma
 * probabilidade de ganhar. Escolher entre eles não pode, nem em princípio,
 * alterar essa probabilidade. Mas a loteria é pari-mutuel: o prêmio das
 * faixas de rateio é dividido entre os acertadores, e as pessoas não escolhem
 * dezenas ao acaso. Entre candidatos equiprováveis, o menos popular entrega
 * mais prêmio se ganhar — de graça, sem trocar nada em troca. É a única
 * melhoria que a matemática autoriza, e o app faria mal em deixá-la na mesa.
 *
 * ## Quem manda quando os passos 2 e 4 discordam
 * Eles discordam sempre que as dezenas de melhor desempenho medido também
 * são as mais apostadas — o que acontece com frequência, porque a percepção
 * de "dezena quente" é ela própria um dos vieses que tornam uma dezena
 * popular. Nessa disputa **o passo 4 prevalece**, e a proporção real de vagas
 * vindas do tier TOP fica abaixo de [TOP_TIER_SHARE].
 *
 * A escolha não é estética. O passo 2 ordena as dezenas por desempenho
 * histórico, e o próprio laboratório deste app demonstra que isso **não tem
 * efeito nenhum** sobre a chance de acertar: `E[acertos] = K·n/N` não olha
 * para quais dezenas foram marcadas. Já o passo 4 tem efeito medido e
 * verificável sobre quanto se recebe ao ganhar. Entre um mecanismo com
 * efeito comprovadamente nulo e outro com efeito comprovado, prevalecer o
 * segundo é a única decisão que a matemática do projeto sustenta.
 *
 * Quem quiser o lote sem a otimização passa `payoutCandidates = 1` — os dois
 * mecanismos ficam isolados e testáveis um sem o outro, em vez de se
 * anularem em silêncio.
 *
 * WHY (tiers recalculados aqui): o tier gravado em cada [NumberPerformance]
 * é relativo ao universo inteiro da loteria. No modo Fechamento o universo
 * encolhe para as dezenas marcadas no volante, então as fatias 40/30/30
 * precisam ser recalculadas sobre o conjunto elegível — caso contrário um
 * fechamento só com dezenas "frias" ficaria sem tier TOP algum.
 *
 * WHY (dispatcher): [generate] é `suspend` mas não troca de contexto; quem
 * chama escolhe o despacho. Mantém o domínio livre de `Dispatchers` e os
 * testes determinísticos.
 *
 * O RNG padrão é [SecureRandom], semeado pelo sistema operacional (entropia
 * verdadeira); testes e relatórios reproduzíveis injetam um [Random] semeado.
 */
class GameGenerator(private val random: Random = SecureRandom()) {

    /**
     * @param count quantidade de jogos, em [MIN_GAMES]..[MAX_GAMES].
     * @param performances desempenho das dezenas; obrigatório e não vazio.
     * @param trevoPerformances desempenho dos trevos 1..6; vazio ou incompleto
     *   cai no fallback de pesos iguais.
     * @param pool modo Fechamento: restringe o sorteio às dezenas marcadas.
     * @param payoutCandidates candidatos avaliados por vaga no desempate por
     *   rateio (passo 4). `1` desliga o desempate e deixa o lote inteiramente
     *   a cargo da distribuição por tiers — útil para isolar um mecanismo do
     *   outro em teste, e para quem quiser o sorteio sem a otimização.
     */
    suspend fun generate(
        lottery: Lottery,
        count: Int,
        performances: List<NumberPerformance>,
        trevoPerformances: List<NumberPerformance> = emptyList(),
        trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
        pool: Collection<Int>? = null,
        payoutCandidates: Int = PAYOUT_CANDIDATES,
    ): GameBatch {
        require(count in MIN_GAMES..MAX_GAMES) {
            "Quantidade de jogos deve estar em $MIN_GAMES..$MAX_GAMES"
        }
        require(payoutCandidates >= 1) { "payoutCandidates deve ser >= 1" }
        require(performances.isNotEmpty()) {
            "Geração exige o desempenho das dezenas (lista vazia)"
        }

        val source = pool?.toList()
        if (source != null) {
            require(source.toSet().size == source.size) { "Dezenas repetidas no fechamento" }
            require(source.all { it in lottery.numberRange }) {
                "Dezena do fechamento fora do intervalo ${lottery.numberRange}"
            }
        }

        val eligible = performances
            .filter { it.number in lottery.numberRange }
            .filter { source == null || it.number in source }
        require(eligible.size >= GAME_SIZE) {
            "Desempenho insuficiente para formar um jogo (dezenas elegíveis: ${eligible.size})"
        }

        val numberTiers = tiersOf(eligible)
        val trevoTiers = trevoTiers(lottery, trevoPerformances)

        val games = mutableListOf<GeneratedGame>()
        repeat(count) {
            games += nextDistinctGame(
                games, numberTiers, lottery, trevoStrategy, trevoTiers, payoutCandidates,
            )
        }

        return GameBatch(
            lottery = lottery,
            games = games.toList(),
            performancesSnapshot = eligible,
            sourcePool = source?.sorted(),
        )
    }

    /**
     * Sorteia [PAYOUT_CANDIDATES] jogos e devolve o menos popular entre os
     * que ainda não estão no lote.
     *
     * A probabilidade de ganhar é idêntica para todos os candidatos — é o
     * teorema da invariância —, então este desempate não a altera. O que ele
     * altera é com quanta gente o prêmio seria dividido.
     */
    private fun leastPopularCandidate(
        existing: List<GeneratedGame>,
        numberTiers: List<List<NumberPerformance>>,
        lottery: Lottery,
        trevoStrategy: TrevoStrategy,
        trevoTiers: List<List<NumberPerformance>>,
        candidates: Int,
    ): GeneratedGame {
        var best: GeneratedGame? = null
        var bestPenalty = Double.MAX_VALUE
        repeat(candidates) {
            val candidate = buildGame(numberTiers, lottery, trevoStrategy, trevoTiers)
            if (existing.any { it.numbers == candidate.numbers }) return@repeat
            val penalty = Unpopularity.penalty(lottery, candidate.numbers)
            if (penalty < bestPenalty) {
                bestPenalty = penalty
                best = candidate
            }
        }
        return best ?: buildGame(numberTiers, lottery, trevoStrategy, trevoTiers)
    }

    /** Minimização de repetição: resorteia enquanto o jogo já existir no lote. */
    private fun nextDistinctGame(
        existing: List<GeneratedGame>,
        numberTiers: List<List<NumberPerformance>>,
        lottery: Lottery,
        trevoStrategy: TrevoStrategy,
        trevoTiers: List<List<NumberPerformance>>,
        payoutCandidates: Int,
    ): GeneratedGame {
        var candidate =
            leastPopularCandidate(existing, numberTiers, lottery, trevoStrategy, trevoTiers, payoutCandidates)
        var attempts = 1
        while (attempts < MAX_DEDUP_ATTEMPTS && existing.any { it.numbers == candidate.numbers }) {
            candidate =
                leastPopularCandidate(existing, numberTiers, lottery, trevoStrategy, trevoTiers, payoutCandidates)
            attempts++
        }
        if (existing.any { it.numbers == candidate.numbers }) {
            // WHY: acontece quando o pool elegível é pequeno demais para
            // produzir combinações distintas (fechamento de 6 a 8 dezenas).
            // Falhar seria pior que entregar o lote com um jogo repetido.
            logger.warning(
                "Jogo repetido aceito após $MAX_DEDUP_ATTEMPTS tentativas: ${candidate.numbers}"
            )
        }
        return candidate
    }

    private fun buildGame(
        numberTiers: List<List<NumberPerformance>>,
        lottery: Lottery,
        trevoStrategy: TrevoStrategy,
        trevoTiers: List<List<NumberPerformance>>,
    ): GeneratedGame {
        val picked = LinkedHashSet<Int>(GAME_SIZE)
        while (picked.size < GAME_SIZE) {
            picked += pickFromTiers(numberTiers, picked) ?: break
        }
        return GeneratedGame(
            // validação: dezenas sempre em ordem crescente e sem repetição
            numbers = picked.sorted(),
            trevoDuplas = trevoDuplas(lottery, trevoStrategy, trevoTiers),
        )
    }

    /**
     * Sorteia o tier pela proporção-alvo e depois a dezena, ponderada pelo
     * peso. Se o tier sorteado já se esgotou, percorre os demais em ordem
     * circular — nunca devolve um jogo incompleto enquanto houver dezena.
     *
     * WHY (sem `filter`): é o laço mais quente do backtest (réplicas ×
     * concursos × jogos × candidatos × dezenas). As dezenas já escolhidas são
     * puladas na própria varredura do tier, sem alocar uma lista por dezena;
     * a ordem de soma e os sorteios do [random] são os mesmos de antes, então
     * a mesma semente produz exatamente o mesmo jogo.
     */
    private fun pickFromTiers(tiers: List<List<NumberPerformance>>, taken: Set<Int>): Int? {
        val roll = random.nextDouble()
        val start = when {
            roll < TOP_TIER_SHARE -> TOP_TIER_INDEX
            roll < TOP_TIER_SHARE + MID_TIER_SHARE -> MID_TIER_INDEX
            else -> LOW_TIER_INDEX
        }
        for (offset in tiers.indices) {
            val tier = tiers[(start + offset) % tiers.size]
            var available = 0
            var total = 0.0
            for (candidate in tier) {
                if (candidate.number in taken) continue
                available++
                total += candidate.weight
            }
            if (available > 0) return weightedPick(tier, taken, available, total)
        }
        return null
    }

    /**
     * Roleta proporcional ao peso sobre as dezenas de [tier] fora de [taken];
     * pesos todos nulos degeneram em uniforme.
     */
    private fun weightedPick(
        tier: List<NumberPerformance>,
        taken: Set<Int>,
        available: Int,
        total: Double,
    ): Int {
        if (total <= 0.0) {
            var index = random.nextInt(available)
            for (candidate in tier) {
                if (candidate.number in taken) continue
                if (index-- == 0) return candidate.number
            }
        }
        var threshold = random.nextDouble() * total
        var last = -1
        for (candidate in tier) {
            if (candidate.number in taken) continue
            threshold -= candidate.weight
            if (threshold <= 0.0) return candidate.number
            last = candidate.number
        }
        return last
    }

    /**
     * Fatia o ranking em TOP/MID/LOW pelos percentis 40/30/30.
     *
     * WHY (empate total vira tier único): quando todas as dezenas têm o mesmo
     * peso — o caso documentado de histórico vazio, em que o analisador
     * declara devolver "sorteio puro" — o ranking é decidido inteiramente
     * pelo desempate por número. Fatiar esse ranking criava três tiers
     * arbitrários (1..24, 25..42, 43..60) e o sorteio de tier dava 70% das
     * vagas às 24 primeiras dezenas: um viés forte, inventado a partir de
     * zero informação, e ainda por cima concentrado na faixa de aniversário,
     * a mais disputada de todas. Sem informação que ordene as dezenas, o
     * único sorteio defensável é o uniforme, e é o que um tier único produz.
     */
    private fun tiersOf(performances: List<NumberPerformance>): List<List<NumberPerformance>> {
        val weights = performances.map { it.weight }
        val spread = (weights.maxOrNull() ?: 0.0) - (weights.minOrNull() ?: 0.0)
        if (spread <= UNINFORMATIVE_WEIGHT_SPREAD) return listOf(performances.toList())

        val ranked = performances.sortedWith(
            compareByDescending<NumberPerformance> { it.weight }.thenBy { it.number }
        )
        val topCut = ceil(ranked.size * TOP_TIER_PERCENTILE).toInt().coerceIn(0, ranked.size)
        val midCut = (topCut + ceil(ranked.size * MID_TIER_PERCENTILE).toInt())
            .coerceIn(topCut, ranked.size)
        return listOf(
            ranked.subList(0, topCut),
            ranked.subList(topCut, midCut),
            ranked.subList(midCut, ranked.size),
        )
    }

    /**
     * Tiers dos trevos 1..6. WHY: quando o backtest não produziu desempenho
     * de trevos (ou produziu incompleto), o fallback é peso igual para todos
     * — melhor um sorteio uniforme honesto que um ranking sobre dados parciais.
     */
    private fun trevoTiers(
        lottery: Lottery,
        trevoPerformances: List<NumberPerformance>,
    ): List<List<NumberPerformance>> {
        if (!lottery.hasTrevos) return List(TIER_COUNT) { emptyList() }
        val covered = trevoPerformances.filter { it.number in Lottery.TREVO_RANGE }
        val complete = covered.map { it.number }.toSet() == Lottery.TREVO_RANGE.toSet()
        val source = if (complete) {
            covered
        } else {
            Lottery.TREVO_RANGE.map { trevo ->
                NumberPerformance(
                    number = trevo,
                    lottery = lottery,
                    hitCount = 0,
                    simulatedHitRate = 0.0,
                    weight = 1.0,
                    tier = PerformanceTier.MID,
                )
            }
        }
        return tiersOf(source)
    }

    private fun trevoDuplas(
        lottery: Lottery,
        trevoStrategy: TrevoStrategy,
        trevoTiers: List<List<NumberPerformance>>,
    ): List<Set<Int>> {
        if (!lottery.hasTrevos) return emptyList()
        return when (trevoStrategy) {
            TrevoStrategy.ECONOMICO -> listOf(pickTrevoDupla(trevoTiers))
            TrevoStrategy.COBERTURA_TOTAL -> allTrevoPairs
        }
    }

    private fun pickTrevoDupla(trevoTiers: List<List<NumberPerformance>>): Set<Int> {
        val dupla = LinkedHashSet<Int>(Lottery.TREVOS_REQUIRED)
        while (dupla.size < Lottery.TREVOS_REQUIRED) {
            dupla += pickFromTiers(trevoTiers, dupla) ?: break
        }
        return dupla
    }

    companion object {
        private val logger: Logger = Logger.getLogger(GameGenerator::class.java.name)

        const val GAME_SIZE = Draw.NUMBERS_DRAWN

        // WHY: teto reduzido de 10 para 5 — lotes maiores raramente eram usados e
        // encareciam a geração/renderização; piso de 2 evita lote degenerado de 1 jogo.
        const val MIN_GAMES = 2
        const val MAX_GAMES = 5

        /** Proporção-alvo de vagas por tier (o LOW fica com o restante, 10%). */
        const val TOP_TIER_SHARE = 0.70
        const val MID_TIER_SHARE = 0.20

        /** Percentis que definem o tamanho de cada tier. */
        const val TOP_TIER_PERCENTILE = 0.40
        const val MID_TIER_PERCENTILE = 0.30

        /** Resorteios antes de aceitar um jogo repetido no lote. */
        const val MAX_DEDUP_ATTEMPTS = 10

        /**
         * Candidatos sorteados por vaga, dos quais fica o menos popular.
         *
         * WHY deste número (medido, não arbitrado): 4.000 lotes por
         * configuração, Mega-Sena, 20 milhões de apostas no concurso.
         *
         * | candidatos | ganho médio | dezenas ≤ 31 | combinações repetidas |
         * |-----------:|------------:|-------------:|----------------------:|
         * | 1          | −1,00%      | 52,5%        | 0 em 4.000            |
         * | 4          | +5,42%      | 33,5%        | 0 em 4.000            |
         * | 12         | **+7,84%**  | 22,6%        | **0 em 4.000**        |
         * | 24         | +8,84%      | 17,1%        | 2 em 4.000            |
         * | 50         | +9,63%      | 12,3%        | 2 em 4.000            |
         *
         * 12 captura 81% do ganho disponível sem nenhuma repetição medida.
         * Acima disso o retorno é decrescente e a concentração começa a
         * aparecer — e concentrar os lotes de todos os usuários nas mesmas
         * combinações "ótimas" recriaria a aglomeração que a otimização
         * existe para evitar, desta vez causada pelo próprio app.
         */
        const val PAYOUT_CANDIDATES = 12

        /**
         * Abaixo desta diferença entre o maior e o menor peso, o ranking não
         * carrega informação e a divisão em tiers seria arbitrária.
         */
        const val UNINFORMATIVE_WEIGHT_SPREAD = 1e-9

        private const val TIER_COUNT = 3
        private const val TOP_TIER_INDEX = 0
        private const val MID_TIER_INDEX = 1
        private const val LOW_TIER_INDEX = 2

        /** As C(6,2) = 15 duplas possíveis de trevos (Cobertura total). */
        val allTrevoPairs: List<Set<Int>> = buildList {
            val trevos = Lottery.TREVO_RANGE.toList()
            for (i in trevos.indices) {
                for (j in i + 1 until trevos.size) {
                    add(setOf(trevos[i], trevos[j]))
                }
            }
        }
    }
}
