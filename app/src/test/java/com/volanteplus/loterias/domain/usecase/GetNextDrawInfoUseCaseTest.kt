package com.volanteplus.loterias.domain.usecase

import com.volanteplus.loterias.data.remote.CaixaDrawDto
import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.data.remote.NextDrawDto
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.IOException

private class FakeCaixaApi(
    private val result: Result<NextDrawDto>,
) : CaixaLotteryApi {
    override suspend fun fetchLatest(lottery: Lottery): CaixaDrawDto =
        throw UnsupportedOperationException("não usado neste teste")

    override suspend fun fetchContest(lottery: Lottery, contestNumber: Int): CaixaDrawDto =
        throw UnsupportedOperationException("não usado neste teste")

    override suspend fun fetchNextDraw(lottery: Lottery): Result<NextDrawDto> = result
}

class GetNextDrawInfoUseCaseTest {

    private fun dto(contest: Int = 2700) = NextDrawDto(
        numero = contest,
        dataApuracao = "01/06/2024",
        dataProximoConcurso = "05/06/2024",
        valorEstimadoProximoConcurso = 45_000_000.0,
    )

    @Test
    fun `emite o proximo concurso quando a api responde com sucesso`() = runTest {
        val useCase = GetNextDrawInfoUseCase(FakeCaixaApi(Result.success(dto())))

        val info = useCase(Lottery.MEGA_SENA).first()

        assertEquals(2700, info?.contestNumber)
        assertEquals(Lottery.MEGA_SENA, info?.lottery)
    }

    @Test
    fun `emite null quando a api falha`() = runTest {
        val useCase = GetNextDrawInfoUseCase(FakeCaixaApi(Result.failure(IOException("indisponível"))))

        val info = useCase(Lottery.MEGA_SENA).first()

        assertNull(info)
    }
}
