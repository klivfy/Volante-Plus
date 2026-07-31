package com.volanteplus.desktop.notification

import com.volanteplus.desktop.prefs.DesktopPreferences
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import com.volanteplus.loterias.domain.usecase.DetectNewContestUseCase

/**
 * Verifica todas as loterias suportadas e devolve as que têm concurso novo
 * desde a última checagem, já atualizando o "último conhecido" em
 * [DesktopPreferences] — a única parte específica do desktop aqui é onde o
 * estado é persistido; a decisão de "é novidade?" vem de
 * [DetectNewContestUseCase] (`:shared`).
 */
class NextDrawNotifier(
    private val detectNewContest: DetectNewContestUseCase,
    private val prefs: DesktopPreferences,
) {
    suspend fun checkAll(): List<NextDrawInfo> =
        Lottery.entries.mapNotNull { lottery ->
            detectNewContest.check(lottery, prefs.lastKnownContest(lottery))?.also { info ->
                prefs.setLastKnownContest(lottery, info.contestNumber)
            }
        }
}
