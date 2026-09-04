package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import java.security.SecureRandom
import java.util.Random
import kotlin.math.sqrt

/**
 * Motor de backtesting: isola o histórico pela data de corte, mede o
 * desempenho das dezenas **apenas** na janela de treino, gera jogos com esse
 * desempenho e cruza com os resultados reais da janela de validação.
 *
 * Honestidade metodológica: o [BacktestAnalyzer] recebe exclusivamente os
 * concursos anteriores ao corte — nunca os posteriores, que serão usados na
 * validação. O relatório mede se o único método de geração do app supera (ou
 * não) o baseline hipergeométrico; a resposta esperada é que não supere.
 *
 * **Unidade de análise.** As estatísticas de inferência são calculadas sobre
 * a série de médias por concurso, com n = concursos de validação. Os jogos de
 * um mesmo lote são disjuntos por construção (regra de repetição mínima do
 * gerador) e portanto negativamente correlacionados — agregá-los como
 * observações i.i.d. subestimava o erro padrão. Concursos distintos são
 * independentes, e por isso são a unidade correta.
 *
 * **Baseline.** A média e a distribuição teóricas vêm de [Hypergeometric] em
 * forma fechada (erro zero), não de simulação.
 */
class BacktestEngine(private val repository: DrawRepository) {

    suspend fun run(config: BacktestConfig): BacktestReport {
        val training = repository.getDrawsUpTo(config.lottery, config.cutoff)
        val validation = repository.getDrawsAfter(config.lottery, config.cutoff)
        require(validation.isNotEmpty()) {
            "Sem concursos após a data de corte ${config.cutoff} — nada a validar"
        }

        // WHY: RNG dedicado à análise de desempenho das dezenas na janela de
        // treino — reprodutível quando config.seed está definida. A análise
        // roda uma única vez: o histórico de treino é fixo, não depende de
        // réplica.
        val analysisRandom: Random = config.seed?.let { Random(it) } ?: SecureRandom()
        val analyzer = BacktestAnalyzer(analysisRandom)
        val performances = analyzer.analyze(training, config)
        val trevoPerformances = analyzer.analyzeTrevos(training, config)

        // Réplica 1 vira o relatório detalhado; as demais alimentam a
        // decomposição de variância. Com `seed` definida todas as réplicas são
        // determinísticas, cada uma derivando sua própria semente.
        val replicationSeries = ArrayList<List<Double>>(config.replications)
        var outcomes: List<ContestOutcome> = emptyList()
        for (replication in 0 until config.replications) {
            val current = simulate(config, performances, trevoPerformances, validation, replication)
            if (replication == 0) outcomes = current
            replicationSeries += current.map { it.meanHits }
        }

        val totalGames = outcomes.sumOf { it.hitsPerGame.size }
        val totalBets = outcomes.sumOf { it.bets }
        val prizeCount = outcomes.sumOf { it.prizedBets }
        val hitDistribution = outcomes
            .flatMap { it.hitsPerGame }
            .groupingBy { it }
            .eachCount()
            .toSortedMap()

        val theoretical = Hypergeometric.distributionFor(config.lottery)
        val theoreticalMean = Hypergeometric.meanFor(config.lottery)

        // série independente: uma média por concurso
        val meanHitsPerContest = outcomes.map { it.meanHits }

        return BacktestReport(
            config = config,
            trainingDraws = training.size,
            validationDraws = validation.size,
            totalGames = totalGames,
            totalBets = totalBets,
            hitDistribution = hitDistribution,
            theoreticalDistribution = theoretical,
            stats = Statistics.ofDoubles(meanHitsPerContest),
            outcomes = outcomes,
            expectedMeanHits = theoreticalMean,
            expectedStdDeviation = Hypergeometric.stdDeviationFor(config.lottery),
            prizeAnalysis = prizeAnalysis(config.lottery, prizeCount, totalBets),
            hypothesisTest = HypothesisTesting.evaluate(
                meanHitsPerContest = meanHitsPerContest,
                hitDistribution = hitDistribution,
                theoreticalDistribution = theoretical,
                theoreticalMean = theoreticalMean,
                gamesPerContest = config.gamesPerContest,
                alpha = config.alpha,
                comparisons = config.comparisons,
            ),
            monteCarlo = MonteCarloSummary.from(replicationSeries),
            expectedReturn = PrizeTable.expectedReturn(config.lottery),
            performances = performances,
            trevoPerformances = trevoPerformances,
        )
    }

    /** Uma passada completa sobre a janela de validação. */
    private fun simulate(
        config: BacktestConfig,
        performances: List<NumberPerformance>,
        trevoPerformances: List<NumberPerformance>,
        validation: List<Draw>,
        replication: Int,
    ): List<ContestOutcome> {
        val generator = GameGenerator(
            config.seed?.let { Random(replicationSeed(it, replication)) } ?: SecureRandom(),
        )
        return validation.map { draw ->
            val batch = generator.generate(
                lottery = config.lottery,
                count = config.gamesPerContest,
                performances = performances,
                trevoPerformances = trevoPerformances,
                trevoStrategy = config.trevoStrategy,
            )
            var bets = 0
            var prized = 0
            val hits = batch.games.map { game ->
                val numberHits = game.numbers.count(draw.numbers::contains)
                if (config.lottery.hasTrevos) {
                    for (dupla in game.trevoDuplas) {
                        bets++
                        val trevoHits = dupla.count(draw.trevos::contains)
                        if (PrizeRules.isPrize(config.lottery, numberHits, trevoHits)) prized++
                    }
                } else {
                    bets++
                    if (PrizeRules.isPrize(config.lottery, numberHits, trevoHits = 0)) prized++
                }
                numberHits
            }
            ContestOutcome(
                contestNumber = draw.contestNumber,
                hitsPerGame = hits,
                bets = bets,
                prizedBets = prized,
            )
        }
    }

    private fun prizeAnalysis(lottery: Lottery, prizeCount: Int, totalBets: Int): PrizeAnalysis {
        val theoretical = Hypergeometric.prizeProbabilityFor(lottery)
        return PrizeAnalysis(
            prizeCount = prizeCount,
            totalBets = totalBets,
            observedRate = if (totalBets == 0) 0.0 else prizeCount.toDouble() / totalBets,
            theoreticalRate = theoretical,
            expectedPrizes = totalBets * theoretical,
            wilsonInterval = wilsonInterval(prizeCount, totalBets),
        )
    }

    companion object {
        /**
         * Semente da réplica: mistura a semente do usuário com o índice por
         * uma constante ímpar grande (variante de SplitMix64), para que
         * réplicas vizinhas não produzam fluxos correlacionados como
         * aconteceria com `seed + replication`.
         */
        fun replicationSeed(seed: Long, replication: Int): Long {
            var z = seed + replication.toLong() * -0x61c8864680b583ebL
            z = (z xor (z ushr 30)) * -0x40a7b892e31b1a47L
            z = (z xor (z ushr 27)) * -0x6b2fb644ecceee15L
            return z xor (z ushr 31)
        }

        /**
         * E[acertos] da distribuição hipergeométrica: sorteadas × jogo / N.
         * É o baseline contra o qual qualquer "vantagem" precisa provar-se —
         * e, pelo teorema da invariância, o valor que toda estratégia obtém
         * em esperança.
         */
        fun expectedMeanHits(lottery: Lottery): Double = Hypergeometric.meanFor(lottery)

        /**
         * Intervalo de Wilson bilateral 95% para uma proporção.
         *
         * Preferido ao intervalo normal simples porque a taxa de premiação é
         * quase sempre 0 em janelas curtas: o intervalo normal colapsaria em
         * [0, 0], sugerindo certeza inexistente, enquanto o de Wilson mantém
         * largura correta.
         */
        fun wilsonInterval(successes: Int, trials: Int, alpha: Double = 0.05): ConfidenceInterval {
            if (trials <= 0) return ConfidenceInterval(0.0, 1.0)
            val z = SpecialFunctions.normalQuantile(1.0 - alpha / 2.0)
            val n = trials.toDouble()
            val pHat = successes / n
            val denominator = 1.0 + z * z / n
            val center = pHat + z * z / (2 * n)
            val margin = z * sqrt(pHat * (1 - pHat) / n + z * z / (4 * n * n))
            return ConfidenceInterval(
                lower = ((center - margin) / denominator).coerceIn(0.0, 1.0),
                upper = ((center + margin) / denominator).coerceIn(0.0, 1.0),
            )
        }
    }
}
