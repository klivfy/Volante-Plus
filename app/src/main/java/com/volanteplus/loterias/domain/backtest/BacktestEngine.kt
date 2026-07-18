package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import java.security.SecureRandom
import java.util.Random

/**
 * Motor de backtesting: isola o histórico pela data de corte, gera jogos
 * com a estratégia sob teste para cada concurso da janela de validação e
 * cruza com os resultados reais.
 *
 * Honestidade metodológica: Aleatório puro e Equilibrado ignoram a janela
 * de treino — a hipótese nula do laboratório. Estratégias com histórico
 * (ex.: Mais sorteadas) recebem exclusivamente a janela de treino, nunca
 * os concursos posteriores ao corte que serão usados na validação.
 *
 * As estatísticas (média/variância/desvio padrão) são calculadas sobre os
 * acertos de dezenas por jogo. A taxa de eficácia é calculada por aposta
 * efetiva (jogo × dupla de trevos na +Milionária), usando [PrizeRules].
 */
class BacktestEngine(private val repository: DrawRepository) {

    suspend fun run(config: BacktestConfig): BacktestReport {
        val training = repository.getDrawsUpTo(config.lottery, config.cutoff)
        val validation = repository.getDrawsAfter(config.lottery, config.cutoff)
        require(validation.isNotEmpty()) {
            "Sem concursos após a data de corte ${config.cutoff} — nada a validar"
        }

        val generator = GameGenerator(config.seed?.let { Random(it) } ?: SecureRandom())
        val hitsPerGame = mutableListOf<Int>()
        var totalBets = 0
        var prizeCount = 0

        for (draw in validation) {
            val batch = generator.generate(
                lottery = config.lottery,
                strategy = config.strategy,
                gameCount = config.gamesPerContest,
                trevoStrategy = config.trevoStrategy,
                history = training,
            )
            for (game in batch.games) {
                val numberHits = game.numbers.count(draw.numbers::contains)
                hitsPerGame += numberHits
                if (config.lottery.hasTrevos) {
                    for (dupla in game.trevoDuplas) {
                        totalBets++
                        val trevoHits = dupla.count(draw.trevos::contains)
                        if (PrizeRules.isPrize(config.lottery, numberHits, trevoHits)) {
                            prizeCount++
                        }
                    }
                } else {
                    totalBets++
                    if (PrizeRules.isPrize(config.lottery, numberHits, trevoHits = 0)) {
                        prizeCount++
                    }
                }
            }
        }

        return BacktestReport(
            config = config,
            trainingDraws = training.size,
            validationDraws = validation.size,
            totalGames = hitsPerGame.size,
            totalBets = totalBets,
            hitDistribution = hitsPerGame.groupingBy { it }.eachCount().toSortedMap(),
            stats = Statistics.of(hitsPerGame),
            expectedMeanHits = expectedMeanHits(config.lottery),
            prizeRate = prizeCount.toDouble() / totalBets,
            prizeCount = prizeCount,
        )
    }

    companion object {
        /**
         * E[acertos] da distribuição hipergeométrica: sorteadas × jogo / N.
         * É o baseline contra o qual qualquer "vantagem" precisa provar-se.
         */
        fun expectedMeanHits(lottery: Lottery): Double =
            Draw.NUMBERS_DRAWN.toDouble() * GameGenerator.GAME_SIZE /
                lottery.numberRange.count()
    }
}
