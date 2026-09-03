package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.TrevoStrategy
import java.time.LocalDate

data class BacktestConfig(
    val lottery: Lottery,
    val strategy: GenerationStrategy,
    /** Concursos com data <= corte ficam na janela de treino; o resto valida. */
    val cutoff: LocalDate,
    /** Jogos gerados por concurso da janela de validação. */
    val gamesPerContest: Int = 1,
    val trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
    /** Semente para reprodutibilidade do relatório; null usa SecureRandom. */
    val seed: Long? = null,
    /** Nível de significância antes da correção de Bonferroni. */
    val alpha: Double = HypothesisTesting.DEFAULT_ALPHA,
    /** Estratégias comparadas na sessão; corrige o α para comparações múltiplas. */
    val comparisons: Int = 1,
)

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
) {
    val verdict: Verdict get() = hypothesisTest.verdict

    /** Taxa de eficácia observada — mantida para compatibilidade da UI. */
    val prizeRate: Double get() = prizeAnalysis.observedRate

    val prizeCount: Int get() = prizeAnalysis.prizeCount
}
