package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

interface CaixaLotteryApi {
    /** Último concurso publicado. */
    suspend fun fetchLatest(lottery: Lottery): CaixaDrawDto

    /** Concurso específico. */
    suspend fun fetchContest(lottery: Lottery, contestNumber: Int): CaixaDrawDto

    /**
     * Dados do próximo concurso (data e prêmio estimado). Result em vez de
     * exceção: consumido por um caso de uso com fallback gracioso quando a
     * API está fora do ar.
     */
    suspend fun fetchNextDraw(lottery: Lottery): Result<NextDrawDto>
}

/**
 * Implementação sobre HttpURLConnection (API pequena; sem necessidade de
 * cliente HTTP adicional nesta fase).
 */
class HttpCaixaLotteryApi(
    private val baseUrl: String = DEFAULT_BASE_URL,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : CaixaLotteryApi {

    override suspend fun fetchLatest(lottery: Lottery): CaixaDrawDto =
        get("$baseUrl/${lottery.apiPath}", CaixaDrawDto.serializer())

    override suspend fun fetchContest(lottery: Lottery, contestNumber: Int): CaixaDrawDto =
        get("$baseUrl/${lottery.apiPath}/$contestNumber", CaixaDrawDto.serializer())

    override suspend fun fetchNextDraw(lottery: Lottery): Result<NextDrawDto> =
        try {
            // WHY: o próprio endpoint do último concurso já traz data e prêmio
            // estimado do próximo — não há endpoint dedicado na API da Caixa.
            Result.success(get("$baseUrl/${lottery.apiPath}", NextDrawDto.serializer()))
        } catch (e: Exception) {
            Result.failure(e)
        }

    private suspend fun <T> get(url: String, serializer: KSerializer<T>): T =
        withContext(Dispatchers.IO) {
            val connection = URL(url).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = TIMEOUT_MS
                connection.readTimeout = TIMEOUT_MS
                connection.setRequestProperty("Accept", "application/json")
                val code = connection.responseCode
                if (code != HttpURLConnection.HTTP_OK) {
                    throw IOException("HTTP $code em $url")
                }
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                json.decodeFromString(serializer, body)
            } finally {
                connection.disconnect()
            }
        }

    companion object {
        const val DEFAULT_BASE_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api"
        private const val TIMEOUT_MS = 15_000
    }
}

private val Lottery.apiPath: String
    get() = when (this) {
        Lottery.MEGA_SENA -> "megasena"
        Lottery.MAIS_MILIONARIA -> "maismilionaria"
    }
