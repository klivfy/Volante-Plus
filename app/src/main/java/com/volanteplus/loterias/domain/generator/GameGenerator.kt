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
 * Regra do lote: dezenas não se repetem entre jogos enquanto houver dezenas
 * inéditas suficientes; quando o intervalo se esgota (ex.: +Milionária com
 * mais de 8 jogos, 8×6=48 de 50), o pool é reiniciado e a repetição mínima
 * recomeça do zero. Na Mega-Sena, 10 jogos disjuntos cobrem exatamente as
 * 60 dezenas.
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
    ): GameBatch {
        require(gameCount in 1..MAX_GAMES) { "Quantidade de jogos deve estar em 1..$MAX_GAMES" }

        val unused = lottery.numberRange.toMutableList()
        val games = List(gameCount) {
            if (unused.size < GAME_SIZE) {
                unused.clear()
                unused += lottery.numberRange
            }
            val numbers = when (strategy) {
                GenerationStrategy.RANDOM -> pickRandom(unused)
                GenerationStrategy.BALANCED -> pickBalanced(unused)
            }
            unused.removeAll(numbers.toSet())
            GeneratedGame(
                numbers = numbers.sorted(),
                trevoDuplas = trevoDuplas(lottery, trevoStrategy),
            )
        }
        return GameBatch(lottery, strategy, games)
    }

    private fun pickRandom(pool: List<Int>): List<Int> = pool.shuffled(random).take(GAME_SIZE)

    /**
     * Metade par, metade ímpar (3+3). Se o pool restante não tiver paridade
     * suficiente, completa com o que houver — a disjunção do lote prevalece.
     */
    private fun pickBalanced(pool: List<Int>): List<Int> {
        val evens = pool.filter { it % 2 == 0 }.shuffled(random)
        val odds = pool.filter { it % 2 != 0 }.shuffled(random)
        val targetEven = minOf(GAME_SIZE / 2, evens.size)
        val targetOdd = minOf(GAME_SIZE - targetEven, odds.size)
        val picked = (evens.take(targetEven) + odds.take(targetOdd)).toMutableList()
        if (picked.size < GAME_SIZE) {
            val remainder = (evens.drop(targetEven) + odds.drop(targetOdd)).shuffled(random)
            picked += remainder.take(GAME_SIZE - picked.size)
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
