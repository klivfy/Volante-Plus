package com.volanteplus.desktop.theme

import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

/**
 * Lê `AppsUseLightTheme` do registro do Windows via `reg query` (API de
 * processo do próprio JDK — nenhuma dependência nova como JNA/JNI, conforme
 * pedido). Retorna null fora do Windows, ou se a leitura falhar por
 * qualquer motivo (registro ausente, timeout, etc.), caso em que o chamador
 * deve cair para `isSystemInDarkTheme()` do Compose.
 */
fun detectWindowsDarkTheme(): Boolean? {
    if (!System.getProperty("os.name").orEmpty().startsWith("Windows")) return null
    return try {
        val process = ProcessBuilder(
            "reg", "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
            "/v", "AppsUseLightTheme",
        ).redirectErrorStream(true).start()

        val output = BufferedReader(InputStreamReader(process.inputStream)).use { it.readText() }
        val finished = process.waitFor(REG_QUERY_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        if (!finished) {
            process.destroyForcibly()
            return null
        }

        val match = REG_VALUE_PATTERN.find(output) ?: return null
        val isLightTheme = match.groupValues[1].toInt(16) != 0
        !isLightTheme
    } catch (e: Exception) {
        null
    }
}

private val REG_VALUE_PATTERN = Regex("""AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-fA-F]+)""")
private const val REG_QUERY_TIMEOUT_SECONDS = 5L
