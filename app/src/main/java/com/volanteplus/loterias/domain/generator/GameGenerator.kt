package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GeneratedGame
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NumberPerformance
import com.volanteplus.loterias.domain.model.PerformanceTier
import com.volanteplus.loterias.domain.model.TrevoStrategy
import java.security.SecureRandom
import java.util.Random
import kotlin.math.roundToInt

/**
 * Gerador de lotes de jogos simples ([Draw.NUMBERS_DRAWN] dezenas).
 *
 * Regra de repetição mínima do lote: nenhuma dezena se repete entre jogos
 * enquanto houver dezenas inéditas; quando as inéditas não bastam para um
 * jogo, elas entram primeiro e o restante vem do pool reposto. Assim toda
 * dezena disponível aparece no lote antes de qualquer repetição (o lote
 * máximo de [MAX_GAMES] jogos nunca esgota o intervalo completo de nenhuma
 * das loterias, então essa regra só se manifesta no modo Fechamento, cujo
 * pool é bem menor).
 *
 * Modo Fechamento: [generate] aceita um `pool` com as dezenas marcadas no
 * volante e desdobra os jogos usando apenas essas dezenas, sob a mesma
 * regra de repetição mínima.
 *
 * O RNG padrão é [SecureRandom] (estratégia "Aleatório puro" exige RNG
 * criptográfico); testes injetam um [Random] semeado para determinismo.
 */
class GameGenerator(private val random: Random = SecureRandom()) {

    fun generate(
        lottery: Lottery,
        strategy: GenerationStrategy,
        gameCount: Int,
        trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
        pool: Collection<Int>? = null,
        /** Concursos da janela de treino; obrigatório para estratégias com histórico. */
        history: List<Draw>? = null,
    ): GameBatch {
        require(gameCount in MIN_GAMES..MAX_GAMES) {
            "Quantidade de jogos deve estar em $MIN_GAMES..$MAX_GAMES"
        }
        if (strategy.requiresHistory) {
            require(!history.isNullOrEmpty()) {
                "Estratégia ${strategy.displayName} exige histórico de concursos (janela de treino vazia)"
            }
        }
        val frequencies: Map<Int, Int> = if (strategy.requiresHistory) {
            history!!.flatMap { it.numbers }.groupingBy { it }.eachCount()
        } else {
            emptyMap()
        }
        val source = pool?.toList()?.sorted() ?: lottery.numberRange.toList()
        if (pool != null) {
            require(source.size >= GAME_SIZE) {
                "Fechamento exige ao menos $GAME_SIZE dezenas (recebidas ${source.size})"
            }
            require(source.toSet().size == source.size) { "Dezenas repetidas no fechamento" }
            require(source.all { it in lottery.numberRange }) {
                "Dezena do fechamento fora do intervalo ${lottery.numberRange}"
            }
        }

        val unused = source.toMutableList()
        val games = List(gameCount) {
            val picked = mutableListOf<Int>()
            if (unused.size < GAME_SIZE) {
                // repetição mínima: as inéditas restantes entram primeiro
                picked += unused
                unused.clear()
                unused += source.filterNot(picked::contains)
            }
            picked += when (strategy) {
                GenerationStrategy.RANDOM ->
                    pickRandom(unused, GAME_SIZE - picked.size)

                GenerationStrategy.BALANCED ->
                    pickBalanced(unused, GAME_SIZE - picked.size, picked)

                GenerationStrategy.FREQUENCY ->
                    pickByFrequency(unused, GAME_SIZE - picked.size, frequencies)

                GenerationStrategy.BACKTEST_DRIVEN ->
                    throw IllegalArgumentException(
                        "Backtest-Driven usa generateWithPerformances(), não generate()"
                    )
            }
            unused.removeAll(picked.toSet())
            GeneratedGame(
                numbers = picked.sorted(),
                trevoDuplas = trevoDuplas(lottery, trevoStrategy),
            )
        }
        return GameBatch(lottery, strategy, games, sourcePool = pool?.let { source })
    }

    /**
     * Geração "Backtest-Driven": prioriza dezenas do tier [PerformanceTier.TOP]
     * calculado por um backtest já executado, sem a regra de repetição
     * mínima entre jogos do lote (cada jogo é sorteado de forma
     * independente a partir do mesmo ranking de desempenho).
     */
    fun generateWithPerformances(
        lottery: Lottery,
        performances: List<NumberPerformance>,
        gameCount: Int,
        trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
        pool: Collection<Int>? = null,
    ): GameBatch {
        require(gameCount in MIN_GAMES..MAX_GAMES) {
            "Quantidade de jogos deve estar em $MIN_GAMES..$MAX_GAMES"
        }
        val eligible = pool?.toSet()?.let { p -> performances.filter { it.number in p } }
            ?: performances
        require(eligible.size >= GAME_SIZE) {
            "Desempenho insuficiente para formar um jogo (recebidas ${eligible.size})"
        }

        val topTier = eligible.filter { it.tier == PerformanceTier.TOP }.map { it.number }
        val rest = eligible.filterNot { it.tier == PerformanceTier.TOP }.map { it.number }
        val topPick = (GAME_SIZE * TOP_TIER_TARGET_RATIO).roundToInt()
            .coerceIn(0, minOf(GAME_SIZE, topTier.size))

        val games = List(gameCount) {
            val picked = topTier.shuffled(random).take(topPick).toMutableList()
            // completa preferencialmente fora do tier TOP, para não distorcer a proporção-alvo
            picked += rest.shuffled(random).take(GAME_SIZE - picked.size)
            if (picked.size < GAME_SIZE) {
                // rest não tinha dezenas suficientes: usa o restante do tier TOP como reserva
                val leftoverTop = topTier.filterNot(picked::contains).shuffled(random)
                picked += leftoverTop.take(GAME_SIZE - picked.size)
            }
            GeneratedGame(
                numbers = picked.sorted(),
                trevoDuplas = trevoDuplas(lottery, trevoStrategy),
            )
        }
        return GameBatch(
            lottery = lottery,
            strategy = GenerationStrategy.BACKTEST_DRIVEN,
            games = games,
            sourcePool = pool?.let { eligible.map { performance -> performance.number }.sorted() },
        )
    }

    private fun pickRandom(pool: List<Int>, count: Int): List<Int> =
        pool.shuffled(random).take(count)

    /**
     * As dezenas mais frequentes do histórico; o embaralhamento prévio faz o
     * desempate aleatório entre frequências iguais (ordenação estável).
     */
    private fun pickByFrequency(pool: List<Int>, count: Int, frequencies: Map<Int, Int>): List<Int> =
        pool.shuffled(random)
            .sortedByDescending { frequencies[it] ?: 0 }
            .take(count)

    /**
     * Completa o jogo mirando metade par, metade ímpar (3+3), descontando o
     * que já entrou por repetição mínima. Se o pool restante não tiver
     * paridade suficiente, completa com o que houver — a repetição mínima
     * prevalece sobre a paridade.
     */
    private fun pickBalanced(pool: List<Int>, count: Int, already: List<Int>): List<Int> {
        val evens = pool.filter { it % 2 == 0 }.shuffled(random)
        val odds = pool.filter { it % 2 != 0 }.shuffled(random)
        val targetEven = (GAME_SIZE / 2 - already.count { it % 2 == 0 })
            .coerceIn(0, minOf(count, evens.size))
        val targetOdd = minOf(count - targetEven, odds.size)
        val picked = (evens.take(targetEven) + odds.take(targetOdd)).toMutableList()
        if (picked.size < count) {
            val remainder = (evens.drop(targetEven) + odds.drop(targetOdd)).shuffled(random)
            picked += remainder.take(count - picked.size)
        }
        return picked
    }

    private fun trevoDuplas(lottery: Lottery, trevoStrategy: TrevoStrategy): List<Set<Int>> {
        if (!lottery.hasTrevos) return emptyList()
        return when (trevoStrategy) {
            TrevoStrategy.ECONOMICO ->
                listOf(Lottery.TREVO_RANGE.toList().shuffled(random).take(2).toSet())

            TrevoStrategy.COBERTURA_TOTAL -> allTrevoPairs
        }
    }

    private fun List<Int>.shuffled(random: Random): List<Int> =
        toMutableList().also { java.util.Collections.shuffle(it, random) }

    companion object {
        const val GAME_SIZE = Draw.NUMBERS_DRAWN
        // WHY: teto reduzido de 10 para 5 — lotes maiores raramente eram usados e
        // encareciam a geração/renderização; piso de 2 evita lote degenerado de 1 jogo.
        const val MIN_GAMES = 2
        const val MAX_GAMES = 5

        /** Fração-alvo de dezenas do tier TOP em cada jogo Backtest-Driven. */
        const val TOP_TIER_TARGET_RATIO = 0.7

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
