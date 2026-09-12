package com.volanteplus.loterias.domain.usecase

import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.domain.model.ContestOutlook
import com.volanteplus.loterias.domain.model.Lottery

/**
 * Busca o retrato financeiro do próximo concurso (acumulado, arrecadação,
 * data). Sempre vai à rede: o dado muda a cada sorteio e um valor guardado
 * poderia induzir uma decisão de aposta com base em acumulado que já foi pago.
 */
class FetchContestOutlook(private val api: CaixaLotteryApi) {

    suspend operator fun invoke(lottery: Lottery): ContestOutlook =
        api.fetchLatest(lottery).toOutlook(lottery)
}
