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
     */
    suspend fun generate(
        lottery: Lottery,
        count: Int,
        performances: List<NumberPerformance>,
        trevoPerformances: List<NumberPerformance> = emptyList(),
        trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
        pool: Collection<Int>? = null,
    ): GameBatch {
        require(count in MIN_GAMES..MAX_GAMES) {
            "Quantidade de jogos deve estar em $MIN_GAMES..$MAX_GAMES"
        }
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
            games += nextDistinctGame(games, numberTiers, lottery, trevoStrategy, trevoTiers)
        }

        return GameBatch(
            lottery = lottery,
            games = games.toList(),
            performancesSnapshot = eligible,
            sourcePool = source?.sorted(),
        )
    }

    /** Minimização de repetição: resorteia enquanto o jogo já existir no lote. */
    private fun nextDistinctGame(
        existing: List<GeneratedGame>,
        numberTiers: List<List<NumberPerformance>>,
        lottery: Lottery,
        trevoStrategy: TrevoStrategy,
        trevoTiers: List<List<NumberPerformance>>,
    ): GeneratedGame {
        var candidate = buildGame(numberTiers, lottery, trevoStrategy, trevoTiers)
        var attempts = 1
        while (attempts < MAX_DEDUP_ATTEMPTS && existing.any { it.numbers == candidate.numbers }) {
            candidate = buildGame(numberTiers, lottery, trevoStrategy, trevoTiers)
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

    /** Fatia o ranking em TOP/MID/LOW pelos percentis 40/30/30. */
    private fun tiersOf(performances: List<NumberPerformance>): List<List<NumberPerformance>> {
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
