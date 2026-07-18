package com.volanteplus.loterias.domain.model

/**
 * Configuração das loterias suportadas e suas regras de negócio de seleção
 * no volante (fonte única de verdade para os limites da UI).
 */
enum class Lottery(
    val displayName: String,
    val numberRange: IntRange,
    val minSelection: Int,
    val maxSelection: Int,
    val hasTrevos: Boolean,
) {
    MEGA_SENA(
        displayName = "Mega-Sena",
        numberRange = 1..60,
        minSelection = 8,
        maxSelection = 15,
        hasTrevos = false,
    ),
    MAIS_MILIONARIA(
        displayName = "+Milionária",
        numberRange = 1..50,
        minSelection = 8,
        maxSelection = 12,
        hasTrevos = true,
    );

    companion object {
        /** Trevos disponíveis na +Milionária (seleção exata obrigatória de 2). */
        val TREVO_RANGE = 1..6
        const val TREVOS_REQUIRED = 2
    }
}

/** Sub-abas de modo de jogo. */
enum class GameMode(val displayName: String) {
    JOGOS_AVULSOS("Jogos avulsos"),
    FECHAMENTO("Fechamento"),
}

/** Estratégia de cobertura de trevos (exclusivo +Milionária). */
enum class TrevoStrategy(val displayName: String, val description: String) {
    ECONOMICO("Econômico", "1 dupla de trevos"),
    COBERTURA_TOTAL("Cobertura total", "15 duplas de trevos"),
}
