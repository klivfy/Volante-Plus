package com.volanteplus.loterias.domain.usecase

import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import kotlinx.coroutines.flow.firstOrNull

/**
 * Compara o número de concurso já conhecido (persistido pelo chamador, de
 * forma específica de cada plataforma) com o que a API reporta agora, para
 * decidir se há um concurso novo a notificar. Fica em `:shared` — mesmo
 * usada hoje só pelo `:desktop` (bandeja/notificações) — porque é pura o
 * bastante para não precisar de `expect`/`actual` (mesmo raciocínio já
 * aplicado ao resto do domínio) e um Android futuro com notificação em
 * background (WorkManager) reaproveitaria a mesma checagem.
 */
class DetectNewContestUseCase(
    private val getNextDrawInfo: GetNextDrawInfoUseCase,
) {
    /**
     * @param lastKnownContest último número de concurso já visto para
     *   [lottery], ou null se nunca verificado. Retorna as informações do
     *   próximo concurso quando ele for diferente do último conhecido (ou
     *   quando não havia nenhum ainda), e null quando não há novidade ou a
     *   API está indisponível.
     */
    suspend fun check(lottery: Lottery, lastKnownContest: Int?): NextDrawInfo? {
        val info = getNextDrawInfo(lottery).firstOrNull() ?: return null
        return if (info.contestNumber != lastKnownContest) info else null
    }
}
