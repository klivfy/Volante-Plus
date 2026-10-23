package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import java.security.SecureRandom
import java.util.Random
import kotlin.math.ceil

/**
 * Deriva o desempenho de cada dezena a partir dos concursos analisados.
 * É a única fonte de dados do gerador de jogos: sem [NumberPerformance] não
 * existe geração.
 *
 * A nota de cada dezena combina duas evidências de naturezas diferentes:
 *
 * 1. **Frequência real** ([NumberPerformance.hitCount], peso
 *    [HIT_COUNT_WEIGHT]) — quantas vezes a dezena saiu de fato.
 * 2. **Simulação** ([NumberPerformance.simulatedHitRate], peso
 *    [SIMULATION_WEIGHT]) — mini-simulações de Monte Carlo com jogos
 *    aleatórios, ver [simulateHitRate].
 *
 * WHY: o app é um laboratório que existe para *refutar* a crença em dezenas
 * quentes, não para vendê-la. A componente simulada injeta ruído amostral
 * deliberado no ranking, de modo que dezenas com frequências parecidas
 * embaralhem entre si a cada análise — exatamente o que a hipótese nula
 * prevê. Um ranking puramente por frequência daria uma falsa impressão de
 * estabilidade que os dados não sustentam.
 *
 * WHY (dispatcher): as funções são `suspend` mas não trocam de contexto — o
 * despacho é decisão de quem chama (ViewModel/engine). Isso mantém o domínio
 * livre de acoplamento a `Dispatchers` e torna os testes determinísticos.
 *
 * O RNG padrão é [SecureRandom]; o motor de backtesting injeta um [Random]
 * semeado quando o relatório precisa ser reproduzível.
 */
class BacktestAnalyzer(private val random: Random = SecureRandom()) {

    /** Desempenho das dezenas do universo da loteria (1..60 Mega, 1..50 +Milionária). */
    suspend fun analyze(draws: List<Draw>, config: BacktestConfig): List<NumberPerformance> =
        rank(
            lottery = config.lottery,
            universe = config.lottery.numberRange.toList(),
            observations = draws.map { it.numbers },
            sampleSize = config.lottery.numbersDrawn,
            rounds = config.simulationRounds,
        )

    /**
     * Desempenho dos trevos 1..6 sob exatamente o mesmo algoritmo.
     * Retorna vazio para loterias sem trevos — o gerador cai no fallback de
     * pesos iguais nesse caso.
     */
    suspend fun analyzeTrevos(draws: List<Draw>, config: BacktestConfig): List<NumberPerformance> {
        if (!config.lottery.hasTrevos) return emptyList()
        return rank(
            lottery = config.lottery,
            universe = Lottery.TREVO_RANGE.toList(),
            observations = draws.map { it.trevos }.filter { it.isNotEmpty() },
            sampleSize = Lottery.TREVOS_REQUIRED,
            rounds = config.simulationRounds,
        )
    }

    /** Linha intermediária do ranking, antes da normalização e do tier. */
    private data class Row(
        val number: Int,
        val hitCount: Int,
        val simulatedHitRate: Double,
        val rawScore: Double,
    )

    private fun rank(
        lottery: Lottery,
        universe: List<Int>,
        observations: List<List<Int>>,
        sampleSize: Int,
        rounds: Int,
    ): List<NumberPerformance> {
        // WHY: sem observações não há nada que diferencie uma dezena da outra.
        // Todas recebem peso máximo (seleção ponderada vira uniforme) e o tier
        // médio, para que o gerador continue funcionando — sorteio puro — em
        // vez de falhar por falta de histórico.
        if (observations.isEmpty()) {
            return universe.map { number ->
                NumberPerformance(
                    number = number,
                    lottery = lottery,
                    hitCount = 0,
                    simulatedHitRate = 0.0,
                    weight = 1.0,
                    tier = PerformanceTier.MID,
                )
            }
        }

        val counts = observations.flatten().groupingBy { it }.eachCount()
        val maxCount = counts.values.maxOrNull() ?: 0

        val rows = universe.map { number ->
            val hitCount = counts[number] ?: 0
            val normalizedHits = if (maxCount == 0) 0.0 else hitCount.toDouble() / maxCount
            val simulated = simulateHitRate(number, universe, observations, sampleSize, rounds)
            Row(
                number = number,
                hitCount = hitCount,
                simulatedHitRate = simulated,
                rawScore = normalizedHits * HIT_COUNT_WEIGHT + simulated * SIMULATION_WEIGHT,
            )
        }

        // normalize(): o melhor da janela vale 1,0 e o resto é proporcional.
        val maxScore = rows.maxOf { it.rawScore }
        val ranked = rows
            .map { it to (if (maxScore <= 0.0) 1.0 else it.rawScore / maxScore) }
            .sortedWith(
                compareByDescending<Pair<Row, Double>> { it.second }.thenBy { it.first.number }
            )

        val topCut = ceil(ranked.size * TOP_TIER_PERCENTILE).toInt().coerceAtMost(ranked.size)
        val midCut = (topCut + ceil(ranked.size * MID_TIER_PERCENTILE).toInt())
            .coerceAtMost(ranked.size)

        return ranked.mapIndexed { index, (row, weight) ->
            NumberPerformance(
                number = row.number,
                lottery = lottery,
                hitCount = row.hitCount,
                simulatedHitRate = row.simulatedHitRate,
                weight = weight,
                tier = when {
                    index < topCut -> PerformanceTier.TOP
                    index < midCut -> PerformanceTier.MID
                    else -> PerformanceTier.LOW
                },
            )
        }
    }

    /**
     * Mini-simulação: em cada rodada monta um jogo aleatório que contém
     * obrigatoriamente [number], sorteia um concurso observado e conta os
     * acertos do jogo contra ele. O retorno é a média de acertos por rodada
     * dividida pelo tamanho do jogo — portanto sempre em 0..1.
     *
     * WHY: as vagas companheiras são ruído puro e convergem para o baseline
     * hipergeométrico; o que sobra de sinal vem de [number] estar (ou não)
     * nos concursos sorteados. Assim a métrica mede a mesma coisa que a
     * frequência, mas *com* a variância amostral que a frequência esconde.
     */
    private fun simulateHitRate(
        number: Int,
        universe: List<Int>,
        observations: List<List<Int>>,
        sampleSize: Int,
        rounds: Int,
    ): Double {
        if (rounds <= 0 || sampleSize <= 0 || universe.isEmpty()) return 0.0
        val companions = universe.filterNot { it == number }
        var hits = 0
        repeat(rounds) {
            val game = HashSet<Int>(sampleSize)
            game += number
            while (game.size < sampleSize && game.size < universe.size) {
                game += companions[random.nextInt(companions.size)]
            }
            val observed = observations[random.nextInt(observations.size)]
            hits += game.count(observed::contains)
        }
        return hits.toDouble() / (rounds * sampleSize)
    }

    companion object {
        /** Rodadas de Monte Carlo por dezena. */
        const val DEFAULT_SIMULATION_ROUNDS = 200

        /** Pesos da combinação frequência real × simulação (somam 1,0). */
        const val HIT_COUNT_WEIGHT = 0.6
        const val SIMULATION_WEIGHT = 0.4

        /** Percentis dos tiers: 40% TOP, 30% MID, 30% LOW. */
        const val TOP_TIER_PERCENTILE = 0.40
        const val MID_TIER_PERCENTILE = 0.30
    }
}
