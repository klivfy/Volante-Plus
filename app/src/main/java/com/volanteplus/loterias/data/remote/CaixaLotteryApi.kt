package com.volanteplus.loterias.data.remote

import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

interface CaixaLotteryApi {
    /** Último concurso publicado. */
    suspend fun fetchLatest(lottery: Lottery): CaixaDrawDto

    /** Concurso específico. */
    suspend fun fetchContest(lottery: Lottery, contestNumber: Int): CaixaDrawDto
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
        get("$baseUrl/${lottery.apiPath}")

    override suspend fun fetchContest(lottery: Lottery, contestNumber: Int): CaixaDrawDto =
        get("$baseUrl/${lottery.apiPath}/$contestNumber")

    private suspend fun get(url: String): CaixaDrawDto = withContext(Dispatchers.IO) {
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
            json.decodeFromString(CaixaDrawDto.serializer(), body)
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
