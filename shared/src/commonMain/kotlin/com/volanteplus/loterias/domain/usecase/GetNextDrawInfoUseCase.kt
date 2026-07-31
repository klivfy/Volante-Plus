package com.volanteplus.loterias.domain.usecase

import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.domain.model.NextDrawInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn

/**
 * Dados do próximo concurso para exibição na tela do volante. A API não é
 * essencial ao fluxo principal (gerar/marcar jogos), então uma falha aqui
 * não deve travar a tela — daí o fallback para `null` em vez de propagar
 * a exceção.
 */
class GetNextDrawInfoUseCase(
    private val api: CaixaLotteryApi,
) {

    operator fun invoke(lottery: Lottery): Flow<NextDrawInfo?> = flow {
        val info = api.fetchNextDraw(lottery)
            .map { it.toDomain(lottery) }
            .getOrNull()
        emit(info)
    }.flowOn(Dispatchers.IO)
}
