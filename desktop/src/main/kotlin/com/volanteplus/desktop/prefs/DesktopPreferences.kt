package com.volanteplus.desktop.prefs

import com.volanteplus.loterias.domain.model.Lottery
import java.util.prefs.Preferences

/**
 * Preferências do desktop persistidas via `java.util.prefs` (registro do
 * Windows por baixo, `~/.java` em Linux/macOS) — não faz parte de `:shared`
 * porque não há equivalente no Android aqui (que usa suas próprias
 * SharedPreferences/DataStore, fora do escopo desta entrega) nem lógica de
 * domínio a compartilhar: é só leitura/escrita de valores simples.
 */
class DesktopPreferences(
    private val prefs: Preferences = Preferences.userNodeForPackage(DesktopPreferences::class.java),
) {
    var lastLottery: Lottery
        get() = Lottery.entries.firstOrNull { it.name == prefs.get(KEY_LOTTERY, null) }
            ?: Lottery.MEGA_SENA
        set(value) = prefs.put(KEY_LOTTERY, value.name)

    /** null = segue o tema do Windows (ou claro, se a detecção falhar). */
    var darkThemeOverride: Boolean?
        get() = if (prefs.get(KEY_THEME, null) == null) null else prefs.getBoolean(KEY_THEME, false)
        set(value) {
            if (value == null) prefs.remove(KEY_THEME) else prefs.putBoolean(KEY_THEME, value)
        }

    var windowWidth: Float
        get() = prefs.getFloat(KEY_WIDTH, DEFAULT_WIDTH)
        set(value) = prefs.putFloat(KEY_WIDTH, value)

    var windowHeight: Float
        get() = prefs.getFloat(KEY_HEIGHT, DEFAULT_HEIGHT)
        set(value) = prefs.putFloat(KEY_HEIGHT, value)

    /** Último número de concurso já notificado, por loteria (chave prefixada). */
    fun lastKnownContest(lottery: Lottery): Int? {
        val value = prefs.getInt(KEY_CONTEST_PREFIX + lottery.name, NO_CONTEST)
        return value.takeIf { it != NO_CONTEST }
    }

    fun setLastKnownContest(lottery: Lottery, contestNumber: Int) {
        prefs.putInt(KEY_CONTEST_PREFIX + lottery.name, contestNumber)
    }

    companion object {
        private const val KEY_LOTTERY = "last_lottery"
        private const val KEY_THEME = "dark_theme_override"
        private const val KEY_WIDTH = "window_width"
        private const val KEY_HEIGHT = "window_height"
        private const val KEY_CONTEST_PREFIX = "last_known_contest_"
        private const val NO_CONTEST = -1
        const val DEFAULT_WIDTH = 900f
        const val DEFAULT_HEIGHT = 700f
    }
}
