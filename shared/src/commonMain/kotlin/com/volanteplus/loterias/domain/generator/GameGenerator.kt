package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.backtest.NumberPerformance
import com.volanteplus.loterias.domain.backtest.PerformanceTier
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
 * Estratégia de sorteio do gerador.
 *
 * - [UNPOPULAR] (padrão): dezenas sorteadas **uniformemente**; entre
 *   [PAYOUT_CANDIDATES] candidatos por jogo fica o menos popular segundo
 *   [Unpopularity]. Não altera a chance de ganhar (teorema da invariância) —
 *   só reduz com quantos apostadores o prêmio seria dividido. É a única
 *   otimização que a matemática autoriza.
 * - [FREQUENCY_TIERS]: a estratégia anterior, por tiers de frequência
 *   histórica. Mantida para o backtest e o laboratório, que existem
 *   justamente para medir que ela não supera o acaso.
 */
enum class GenerationStrategy { UNPOPULAR, FREQUENCY_TIERS }

/**
 * Gerador de lotes de jogos simples ([Draw.NUMBERS_DRAWN] dezenas).
 *
 * Fonte única de dados: a lista de [NumberPerformance] produzida pelo
 * `BacktestAnalyzer`.
 *
 * ALGORITMO (estratégia padrão [GenerationStrategy.UNPOPULAR])
 * 1. Cada jogo sorteia dezenas uniformemente (todos os jogos têm exatamente
 *    a mesma chance de ganhar — sorteio honesto é i.i.d. e nenhum histórico
 *    muda isso).
 * 2. **Desempate por rateio**: cada vaga do lote sorteia
 *    [PAYOUT_CANDIDATES] jogos pelo processo acima e fica com o menos
 *    popular segundo [Unpopularity]. Ver WHY abaixo.
 * 3. Jogo repetido dentro do lote é resorteado até [MAX_DEDUP_ATTEMPTS]
 *    vezes; passando disso, o jogo é aceito com um aviso no log.
 * 4. **Trevos complementares** (+Milionária, estratégia Econômico): as
 *    duplas do lote são sorteadas **sem repetição** — com 3 jogos, uma
 *    partição aleatória dos 6 trevos — o que maximiza a chance de pelo
 *    menos um prêmio pelo mesmo custo (ver SC-005 da spec 002).
 *
 * ALGORITMO ([GenerationStrategy.FREQUENCY_TIERS], legado)
 * 1. As dezenas elegíveis são ordenadas por [NumberPerformance.weight] e
 *    fatiadas em três tiers por percentil: 40% TOP, 30% MID, 30% LOW.
 * 2. Cada vaga do jogo sorteia primeiro um tier ([TOP_TIER_SHARE] = 70%,
 *    [MID_TIER_SHARE] = 20%, o restante 10% para o LOW) e depois uma dezena
 *    *dentro* do tier, com probabilidade proporcional ao peso.
 * 3. Deduplicação e desempate por rateio como acima.
 *
 * WHY (estratégia padrão uniforme, não tiers): o passo dos tiers ordena as
 * dezenas por desempenho histórico, e o próprio laboratório deste app
 * demonstra que isso **não tem efeito nenhum** sobre a chance de acertar:
 * `E[acertos] = K·n/N` não olha para quais dezenas foram marcadas. Pior: os
 * tiers concentram 70% das vagas nas dezenas de maior frequência medida —
 * desproporcionalmente na faixa de aniversário (≤ 31), a mais apostada —, de
 * modo que o desempate por rateio (o único mecanismo com efeito comprovado)
 * tinha de brigar contra o próprio sorteio. Com candidatos uniformes, o
 * desempate explora todo o universo a cada vaga.
 *
 * WHY (passo 2 — a única otimização que existe): pelo teorema da invariância,
 * todos os candidatos sorteados no passo 1 têm **exatamente** a mesma
 * probabilidade de ganhar. Escolher entre eles não pode, nem em princípio,
 * alterar essa probabilidade. Mas a loteria é pari-mutuel: o prêmio das
 * faixas de rateio é dividido entre os acertadores, e as pessoas não escolhem
 * dezenas ao acaso. Entre candidatos equiprováveis, o menos popular entrega
 * mais prêmio se ganhar — de graça, sem trocar nada em troca. É a única
 * melhoria que a matemática autoriza, e o app faria mal em deixá-la na mesa.
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
     *   rateio. `1` desliga o desempate e deixa o lote inteiramente a cargo
     *   do sorteio — útil para isolar um mecanismo do outro em teste.
     * @param recentNumbers dezenas do concurso mais recente (opcional): entram
     *   no [Unpopularity.penalty] como menos apostadas. Nulo/ausente em
     *   protocolos determinísticos (ex.: backtest).
     * @param strategy [GenerationStrategy.UNPOPULAR] (padrão) ou
     *   [GenerationStrategy.FREQUENCY_TIERS] (legado, usada pelo backtest e
     *   pelo laboratório para medir a estratégia antiga).
     */
    suspend fun generate(
        lottery: Lottery,
        count: Int,
        performances: List<NumberPerformance>,
        trevoPerformances: List<NumberPerformance> = emptyList(),
        trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
        pool: Collection<Int>? = null,
        payoutCandidates: Int = PAYOUT_CANDIDATES,
        recentNumbers: Collection<Int> = emptySet(),
        strategy: GenerationStrategy = GenerationStrategy.UNPOPULAR,
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

        // Tiers só existem na estratégia legada; a padrão sorteia uniforme.
        val numberTiers = if (strategy == GenerationStrategy.FREQUENCY_TIERS) {
            tiersOf(eligible)
        } else {
            List(TIER_COUNT) { emptyList() }
        }
        val trevoTiers = if (strategy == GenerationStrategy.FREQUENCY_TIERS) {
            trevoTiers(lottery, trevoPerformances)
        } else {
            List(TIER_COUNT) { emptyList() }
        }

        val games = mutableListOf<GeneratedGame>()
        repeat(count) {
            games += when (strategy) {
                GenerationStrategy.FREQUENCY_TIERS -> nextDistinctGame(
                    existing = games,
                    numberTiers = numberTiers,
                    lottery = lottery,
                    trevoStrategy = trevoStrategy,
                    trevoTiers = trevoTiers,
                    payoutCandidates = payoutCandidates,
                    recentNumbers = recentNumbers,
                )

                GenerationStrategy.UNPOPULAR -> nextDistinctUniformGame(
                    existing = games,
                    lottery = lottery,
                    universe = eligible.map { it.number },
                    payoutCandidates = payoutCandidates,
                    recentNumbers = recentNumbers,
                )
            }
        }

        // WHY (trevos por lote, não por jogo): no Econômico, sortear a dupla
        // independentemente por jogo pode repetir duplas entre os jogos do
        // lote. Duplas distintas maximizam a chance de pelo menos um prêmio
        // pelo mesmo custo — a spec 002 mede 25,4% contra 25,1% em lotes de 3
        // jogos. A estratégia legada mantém o sorteio por jogo: o laboratório
        // mede o comportamento antigo, não o novo.
        val finishedGames = if (strategy == GenerationStrategy.UNPOPULAR) {
            assignBatchTrevoDuplas(games, lottery, trevoStrategy)
        } else {
            games
        }

        return GameBatch(
            lottery = lottery,
            games = finishedGames,
            performancesSnapshot = eligible,
            sourcePool = source?.sorted(),
            strategyLabel = if (strategy == GenerationStrategy.UNPOPULAR) {
                UNPOPULAR_STRATEGY_LABEL
            } else {
                GameBatch.STRATEGY_LABEL
            },
        )
    }

    /**
     * Sorteia [candidates] jogos uniformes e devolve o menos popular entre os
     * que ainda não estão no lote. Ver WHY do passo 2 na doc da classe.
     */
    private fun leastPopularUniformCandidate(
        existing: List<GeneratedGame>,
        lottery: Lottery,
        universe: List<Int>,
        candidates: Int,
        recentNumbers: Collection<Int>,
    ): GeneratedGame {
        var best: GeneratedGame? = null
        var bestPenalty = Double.MAX_VALUE
        repeat(candidates) {
            val candidate = buildUniformGame(universe)
            if (existing.any { it.numbers == candidate.numbers }) return@repeat
            val penalty = Unpopularity.penalty(lottery, candidate.numbers, recentNumbers)
            if (penalty < bestPenalty) {
                bestPenalty = penalty
                best = candidate
            }
        }
        return best ?: buildUniformGame(universe)
    }

    /** Jogo uniforme: dezenas distintas sorteadas de [universe] sem ponderação. */
    private fun buildUniformGame(universe: List<Int>): GeneratedGame {
        val picked = LinkedHashSet<Int>(GAME_SIZE)
        while (picked.size < GAME_SIZE) {
            picked += universe[random.nextInt(universe.size)]
        }
        return GeneratedGame(numbers = picked.sorted())
    }

    /** Minimização de repetição: resorteia enquanto o jogo já existir no lote. */
    private fun nextDistinctUniformGame(
        existing: List<GeneratedGame>,
        lottery: Lottery,
        universe: List<Int>,
        payoutCandidates: Int,
        recentNumbers: Collection<Int>,
    ): GeneratedGame {
        var candidate = leastPopularUniformCandidate(
            existing, lottery, universe, payoutCandidates, recentNumbers,
        )
        var attempts = 1
        while (attempts < MAX_DEDUP_ATTEMPTS && existing.any { it.numbers == candidate.numbers }) {
            candidate = leastPopularUniformCandidate(
                existing, lottery, universe, payoutCandidates, recentNumbers,
            )
            attempts++
        }
        if (existing.any { it.numbers == candidate.numbers }) {
            // WHY: acontece quando o universo elegível é pequeno demais para
            // produzir combinações distintas (fechamento de 6 dezenas).
            // Falhar seria pior que entregar o lote com um jogo repetido.
            logger.warning(
                "Jogo repetido aceito após $MAX_DEDUP_ATTEMPTS tentativas: ${candidate.numbers}"
            )
        }
        return candidate
    }

    /**
     * Atribui as duplas de trevos ao lote inteiro.
     *
     * - COBERTURA_TOTAL: cada jogo leva as 15 duplas (inalterado).
     * - ECONÔMICO: uma dupla distinta por jogo; com até 3 jogos, as duplas
     *   saem de uma partição aleatória dos 6 trevos (disjuntas — o lote
     *   cobre 2·k trevos); com 4 ou 5 jogos, as 3 duplas da partição cobrem
     *   os 6 trevos e as demais completam com duplas distintas sorteadas.
     */
    private fun assignBatchTrevoDuplas(
        games: List<GeneratedGame>,
        lottery: Lottery,
        trevoStrategy: TrevoStrategy,
    ): List<GeneratedGame> {
        if (!lottery.hasTrevos) return games
        return when (trevoStrategy) {
            TrevoStrategy.COBERTURA_TOTAL ->
                games.map { it.copy(trevoDuplas = allTrevoPairs) }

            TrevoStrategy.ECONOMICO -> {
                val duplas = complementaryTrevoDuplas(games.size)
                games.zip(duplas) { game, dupla -> game.copy(trevoDuplas = listOf(dupla)) }
            }
        }
    }

    /**
     * Duplas distintas para [count] jogos. A ordem final é embaralhada para
     * que dois usuários com lotes semelhantes não recebam as duplas nas
     * mesmas posições — escolher sempre o mesmo arranjo recriaria a
     * aglomeração que esta otimização existe para evitar.
     */
    private fun complementaryTrevoDuplas(count: Int): List<Set<Int>> {
        val trevos = Lottery.TREVO_RANGE.toList()
        val shuffled = trevos.toMutableList().also(::shuffleWith)
        val matching = shuffled.chunked(2).map { it.toSet() }
        if (count <= matching.size) return matching.take(count).toMutableList().also(::shuffleWith)

        val chosen = matching.toMutableList()
        val extras = allTrevoPairs.filterNot { it in matching }.toMutableList().also(::shuffleWith)
        chosen += extras.take(count - matching.size)
        return chosen.also(::shuffleWith)
    }

    /** Fisher–Yates com o RNG da instância (java.util.Random funciona em common). */
    private fun <T> shuffleWith(list: MutableList<T>) {
        for (i in list.size - 1 downTo 1) {
            val j = random.nextInt(i + 1)
            val tmp = list[i]
            list[i] = list[j]
            list[j] = tmp
        }
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
        recentNumbers: Collection<Int>,
    ): GeneratedGame {
        var best: GeneratedGame? = null
        var bestPenalty = Double.MAX_VALUE
        repeat(candidates) {
            val candidate = buildGame(numberTiers, lottery, trevoStrategy, trevoTiers)
            if (existing.any { it.numbers == candidate.numbers }) return@repeat
            val penalty = Unpopularity.penalty(lottery, candidate.numbers, recentNumbers)
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
        recentNumbers: Collection<Int>,
    ): GeneratedGame {
        var candidate = leastPopularCandidate(
            existing, numberTiers, lottery, trevoStrategy, trevoTiers, payoutCandidates, recentNumbers,
        )
        var attempts = 1
        while (attempts < MAX_DEDUP_ATTEMPTS && existing.any { it.numbers == candidate.numbers }) {
            candidate = leastPopularCandidate(
                existing, numberTiers, lottery, trevoStrategy, trevoTiers, payoutCandidates, recentNumbers,
            )
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
     */
    private fun pickFromTiers(tiers: List<List<NumberPerformance>>, taken: Set<Int>): Int? {
        val roll = random.nextDouble()
        val start = when {
            roll < TOP_TIER_SHARE -> TOP_TIER_INDEX
            roll < TOP_TIER_SHARE + MID_TIER_SHARE -> MID_TIER_INDEX
            else -> LOW_TIER_INDEX
        }
        for (offset in tiers.indices) {
            val candidates = tiers[(start + offset) % tiers.size].filter { it.number !in taken }
            if (candidates.isNotEmpty()) return weightedPick(candidates)
        }
        return null
    }

    /** Roleta proporcional ao peso; pesos todos nulos degeneram em uniforme. */
    private fun weightedPick(candidates: List<NumberPerformance>): Int {
        val total = candidates.sumOf { it.weight }
        if (total <= 0.0) return candidates[random.nextInt(candidates.size)].number
        var threshold = random.nextDouble() * total
        for (candidate in candidates) {
            threshold -= candidate.weight
            if (threshold <= 0.0) return candidate.number
        }
        return candidates.last().number
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
         * configuração, Mega-Sena, 20 milhões de apostas no concurso, sorteio
         * **uniforme** — o protocolo da estratégia padrão (a tabela anterior,
         * sobre o sorteio por tiers, foi substituída quando o padrão mudou):
         *
         * | candidatos | ganho médio | dezenas ≤ 31 | jogos repetidos |
         * |-----------:|------------:|-------------:|----------------:|
         * | 1          | −0,73%      | 51,6%        | 5 em 16.000     |
         * | 4          | +4,58%      | 37,1%        | 4 em 16.000     |
         * | 12         | **+6,68%**  | 28,5%        | 11 em 16.000    |
         * | 24         | +7,64%      | 23,7%        | 16 em 16.000    |
         * | 64         | +8,65%      | 18,3%        | 24 em 16.000    |
         *
         * 12 captura 77% do ganho disponível com repetição quase nula
         * (~0,07% dos jogos). Acima disso o retorno é decrescente e a
         * concentração começa a aparecer — e concentrar os lotes de todos os
         * usuários nas mesmas combinações "ótimas" recriaria a aglomeração
         * que a otimização existe para evitar, desta vez causada pelo próprio
         * app.
         */
        const val PAYOUT_CANDIDATES = 12

        /**
         * Abaixo desta diferença entre o maior e o menor peso, o ranking não
         * carrega informação e a divisão em tiers seria arbitrária.
         */
        const val UNINFORMATIVE_WEIGHT_SPREAD = 1e-9

        /** Rótulo do lote gerado pela estratégia padrão, de baixa popularidade. */
        const val UNPOPULAR_STRATEGY_LABEL = "Baixa popularidade"

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
