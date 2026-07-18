package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.GameBatch
import com.volanteplus.loterias.domain.model.GeneratedGame
import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import java.security.SecureRandom
import java.util.Random

/**
 * Gerador de lotes de jogos simples ([Draw.NUMBERS_DRAWN] dezenas).
 *
 * Regra de repetição mínima do lote: nenhuma dezena se repete entre jogos
 * enquanto houver dezenas inéditas; quando as inéditas não bastam para um
 * jogo, elas entram primeiro e o restante vem do pool reposto. Assim toda
 * dezena disponível aparece no lote antes de qualquer repetição (Mega-Sena:
 * 10 jogos disjuntos cobrem as 60; +Milionária: as 50 aparecem até o 9º
 * jogo).
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
        require(gameCount in 1..MAX_GAMES) { "Quantidade de jogos deve estar em 1..$MAX_GAMES" }
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
            }
            unused.removeAll(picked.toSet())
            GeneratedGame(
                numbers = picked.sorted(),
                trevoDuplas = trevoDuplas(lottery, trevoStrategy),
            )
        }
        return GameBatch(lottery, strategy, games, sourcePool = pool?.let { source })
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
        const val MAX_GAMES = 10

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
