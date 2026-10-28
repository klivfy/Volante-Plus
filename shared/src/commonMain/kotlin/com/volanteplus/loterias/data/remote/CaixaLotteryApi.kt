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

    init {
        // WHY: a URL base é injetável (testes, espelhos, variável de ambiente).
        // Em http:// o histórico de concursos — que alimenta todo o
        // laboratório — viajaria em claro e seria adulterável por qualquer
        // intermediário da rede. Um app que se propõe a provar afirmações
        // com dados não pode aceitar dados de origem não autenticada.
        require(baseUrl.startsWith("https://")) {
            "A URL base precisa usar https:// (recebida: $baseUrl)"
        }
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
                json.decodeFromString(serializer, connection.inputStream.readBoundedText(url))
            } finally {
                connection.disconnect()
            }
        }

    /**
     * Lê o corpo da resposta com teto de [MAX_RESPONSE_BYTES].
     *
     * WHY: `readText()` lê até o fim, sem limite. Um endpoint comprometido,
     * um espelho hostil ou um intermediário podem responder um fluxo
     * indefinido e derrubar o app por falta de memória — a leitura acontece
     * no aparelho do usuário, com o heap de um processo Android. O teto
     * transforma esse cenário num erro tratável.
     */
    private fun java.io.InputStream.readBoundedText(url: String): String {
        val reader = bufferedReader()
        val builder = StringBuilder()
        val chunk = CharArray(DEFAULT_CHUNK_CHARS)
        reader.use {
            while (true) {
                val read = it.read(chunk)
                if (read < 0) break
                if (builder.length + read > MAX_RESPONSE_BYTES) {
                    throw IOException(
                        "Resposta de $url excede o limite de $MAX_RESPONSE_BYTES caracteres"
                    )
                }
                builder.appendRange(chunk, 0, read)
            }
        }
        return builder.toString()
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api"
        private const val TIMEOUT_MS = 15_000

        /**
         * Teto do corpo aceito. O maior payload real da API (um concurso com
         * a lista completa de rateios) fica na casa de dezenas de KB; 4 MB dá
         * três ordens de grandeza de folga sem deixar o limite inócuo.
         */
        const val MAX_RESPONSE_BYTES = 4 * 1024 * 1024

        private const val DEFAULT_CHUNK_CHARS = 8 * 1024
    }
}

private val Lottery.apiPath: String
    get() = when (this) {
        Lottery.MEGA_SENA -> "megasena"
        Lottery.MAIS_MILIONARIA -> "maismilionaria"
        Lottery.QUINA -> "quina"
    }
