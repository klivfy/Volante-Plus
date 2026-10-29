package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import java.time.LocalDate

data class BacktestConfig(
    val lottery: Lottery,
    /** Concursos com data <= corte ficam na janela de treino; o resto valida. */
    val cutoff: LocalDate,
    /** Jogos gerados por concurso da janela de validação. */
    val gamesPerContest: Int = GameGenerator.MIN_GAMES,
    val trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
    /** Rodadas de Monte Carlo por dezena no [BacktestAnalyzer]. */
    val simulationRounds: Int = BacktestAnalyzer.DEFAULT_SIMULATION_ROUNDS,
    /** Semente para reprodutibilidade do relatório; null sorteia uma pelo SecureRandom. */
    val seed: Long? = null,
    /** Nível de significância antes da correção de Bonferroni. */
    val alpha: Double = HypothesisTesting.DEFAULT_ALPHA,
    /** Estratégias comparadas na sessão; corrige o α para comparações múltiplas. */
    val comparisons: Int = 1,
    /**
     * Réplicas independentes do backtest inteiro.
     *
     * Uma única passada mistura duas fontes de variação: a do sorteio (que é
     * da loteria) e a do sorteio de jogos feito pelo próprio método (que é
     * nossa). Repetindo a passada com sementes diferentes, o mesmo histórico
     * produz médias diferentes — e a dispersão entre elas mede exatamente o
     * ruído que o método adiciona. Ver [VarianceDecomposition].
     */
    val replications: Int = DEFAULT_REPLICATIONS,
) {
    init {
        require(replications >= 1) { "replications deve ser >= 1 (recebido $replications)" }
        require(gamesPerContest >= 1) { "gamesPerContest deve ser >= 1" }
    }

    companion object {
        /**
         * 200 réplicas reduzem o erro padrão de Monte Carlo por um fator de
         * √200 ≈ 14,1 em relação a uma única passada, a custo linear.
         */
        const val DEFAULT_REPLICATIONS = 200
    }
}

/**
 * Decomposição da variação observada em duas parcelas, pela lei da variância
 * total: Var(X) = E[Var(X | réplica)] + Var(E[X | réplica]).
 *
 * - [intrinsic] — a variação **da loteria**: quanto a média de acertos oscila
 *   de concurso para concurso. Irredutível. Nenhum método a diminui.
 * - [monteCarlo] — a variação **do método**: quanto o resultado muda só por
 *   termos sorteado outros jogos. Redutível, e é o que as réplicas reduzem.
 *
 * A distinção é o ponto da entrega: quando alguém vê uma estratégia "indo
 * bem", precisa saber se está vendo a loteria ou o ruído da medição.
 */
data class VarianceDecomposition(
    val intrinsic: Double,
    val monteCarlo: Double,
) {
    val total: Double get() = intrinsic + monteCarlo

    /** Fatia da variação que é ruído do método, de 0 a 1. */
    val monteCarloFraction: Double get() = if (total <= 0.0) 0.0 else monteCarlo / total
}

/**
 * Agregado das réplicas independentes.
 *
 * [standardError] é o erro padrão da média **entre réplicas** — a incerteza
 * que sobra na estimativa depois de repetir o experimento [replications] vezes.
 */
data class MonteCarloSummary(
    val replications: Int,
    /** Média das médias globais de cada réplica. */
    val meanOfMeans: Double,
    val standardError: Double,
    val decomposition: VarianceDecomposition,
    /** Média global de cada réplica, na ordem de execução. */
    val replicationMeans: List<Double>,
) {
    /** Intervalo de confiança de 95% da média estimada, entre réplicas. */
    val interval: ConfidenceInterval
        get() {
            if (replications < 2 || standardError <= 0.0) {
                return ConfidenceInterval(meanOfMeans, meanOfMeans)
            }
            val z = SpecialFunctions.normalQuantile(0.975)
            return ConfidenceInterval(meanOfMeans - z * standardError, meanOfMeans + z * standardError)
        }

    companion object {
        /** Constrói o resumo a partir das séries de médias por concurso de cada réplica. */
        fun from(perReplication: List<List<Double>>): MonteCarloSummary {
            require(perReplication.isNotEmpty()) { "Nenhuma réplica executada" }
            val means = perReplication.map { series ->
                if (series.isEmpty()) 0.0 else series.average()
            }
            // E[Var(X | réplica)]: variação concurso a concurso, média entre réplicas.
            val intrinsic = perReplication
                .map { Statistics.ofDoubles(it).sampleVariance }
                .average()
            // Var(E[X | réplica]): variação das médias entre réplicas.
            val between = Statistics.ofDoubles(means)
            return MonteCarloSummary(
                replications = perReplication.size,
                meanOfMeans = between.mean,
                standardError = if (perReplication.size < 2) 0.0 else between.standardError,
                decomposition = VarianceDecomposition(
                    intrinsic = intrinsic,
                    monteCarlo = if (perReplication.size < 2) 0.0 else between.sampleVariance,
                ),
                replicationMeans = means,
            )
        }
    }
}

/**
 * Resultado de um concurso da janela de validação — a **unidade de observação
 * independente** do backtest.
 *
 * Os jogos de um mesmo lote são disjuntos por construção (regra de repetição
 * mínima do gerador), logo são dependentes entre si: não podem ser tratados
 * como observações independentes. Concursos distintos, por outro lado, são
 * independentes, porque cada sorteio é independente dos demais.
 */
data class ContestOutcome(
    val contestNumber: Int,
    /** Acertos de cada jogo do lote — dependentes entre si. */
    val hitsPerGame: List<Int>,
    /** Apostas efetivas do concurso (jogos × duplas de trevos). */
    val bets: Int,
    val prizedBets: Int,
) {
    /** Soma de acertos do lote. Com lote cobrindo todo o universo, é constante. */
    val totalHits: Int get() = hitsPerGame.sum()

    /** Média de acertos por jogo neste concurso — a observação independente. */
    val meanHits: Double
        get() = if (hitsPerGame.isEmpty()) 0.0 else totalHits.toDouble() / hitsPerGame.size
}

/** Comparação entre a taxa observada e a probabilidade exata de premiação. */
data class PrizeAnalysis(
    val prizeCount: Int,
    val totalBets: Int,
    /** Taxa observada: premiadas / apostas efetivas. */
    val observedRate: Double,
    /** Probabilidade exata de uma aposta ser premiada. */
    val theoreticalRate: Double,
    /** Prêmios esperados = apostas × probabilidade exata. */
    val expectedPrizes: Double,
    /**
     * Intervalo de Wilson 95%. Correto para proporções próximas de zero, onde
     * o intervalo normal simples degenera para [0,0] e sugere falsa precisão.
     */
    val wilsonInterval: ConfidenceInterval,
) {
    /**
     * true quando os prêmios esperados são poucos demais para estimar a taxa.
     * Nesse regime, um `observedRate` de 0 não é resultado — é falta de dados.
     */
    val underpowered: Boolean get() = expectedPrizes < MIN_EXPECTED_EVENTS

    companion object {
        /** Mínimo usual de eventos esperados para uma proporção ser estimável. */
        const val MIN_EXPECTED_EVENTS = 10.0
    }
}

data class BacktestReport(
    val config: BacktestConfig,
    val trainingDraws: Int,
    val validationDraws: Int,
    val totalGames: Int,
    /** Apostas efetivas: jogos × duplas de trevos (= jogos na Mega-Sena). */
    val totalBets: Int,
    /** Distribuição observada: acertos de dezenas -> quantidade de jogos. */
    val hitDistribution: Map<Int, Int>,
    /** Distribuição teórica exata: acertos -> probabilidade. */
    val theoreticalDistribution: Map<Int, Double>,
    /**
     * Estatísticas da série de médias por concurso — n = [validationDraws]
     * observações independentes, não [totalGames].
     */
    val stats: Statistics,
    /** Resultado concurso a concurso, para inspeção e auditoria. */
    val outcomes: List<ContestOutcome>,
    /** Média teórica de acertos (hipergeométrica exata): 0,60 Mega; 0,72 +Milionária. */
    val expectedMeanHits: Double,
    /** Desvio padrão teórico dos acertos de um jogo. */
    val expectedStdDeviation: Double,
    val prizeAnalysis: PrizeAnalysis,
    /** Veredito estatístico formal com valor-p, IC, poder e correção múltipla. */
    val hypothesisTest: HypothesisTest,
    /** Agregado das réplicas de Monte Carlo e separação das fontes de variação. */
    val monteCarlo: MonteCarloSummary,
    /** Retorno esperado em reais — igual para toda estratégia, sempre negativo. */
    val expectedReturn: ExpectedReturn,
    /** Desempenho das dezenas na janela de treino — alimenta o gerador único do app. */
    val performances: List<NumberPerformance>,
    /** Desempenho dos trevos; vazio fora da +Milionária. */
    val trevoPerformances: List<NumberPerformance>,
) {
    val verdict: Verdict get() = hypothesisTest.verdict

    /** Taxa de eficácia observada — mantida para compatibilidade da UI. */
    val prizeRate: Double get() = prizeAnalysis.observedRate

    val prizeCount: Int get() = prizeAnalysis.prizeCount

    /** Perda esperada, em reais, de todas as apostas simuladas neste backtest. */
    val expectedLoss: Double get() = expectedReturn.expectedLossFor(totalBets)
}
