package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.generator.GameGenerator
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
    val gamesPerContest: Int = GameGenerator.MIN_GAMES,
    val trevoStrategy: TrevoStrategy = TrevoStrategy.ECONOMICO,
    /** Semente para reprodutibilidade do relatório; null usa SecureRandom. */
    val seed: Long? = null,
)

data class BacktestReport(
    val config: BacktestConfig,
    val trainingDraws: Int,
    val validationDraws: Int,
    val totalGames: Int,
    /** Apostas efetivas: jogos × duplas de trevos (= jogos na Mega-Sena). */
    val totalBets: Int,
    /** Distribuição: acertos de dezenas -> quantidade de jogos. */
    val hitDistribution: Map<Int, Int>,
    /** Estatísticas dos acertos de dezenas por jogo. */
    val stats: Statistics,
    /** Média teórica de acertos (hipergeométrica): 6×6/60 = 0,60 na Mega; 0,72 na +Milionária. */
    val expectedMeanHits: Double,
    /** Taxa de eficácia: apostas premiadas / apostas efetivas. */
    val prizeRate: Double,
    val prizeCount: Int,
)
