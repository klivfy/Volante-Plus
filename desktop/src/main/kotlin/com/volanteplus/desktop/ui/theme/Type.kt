package com.volanteplus.desktop.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp

/**
 * Mesma escala de tamanhos/pesos do Android (ui/theme/Type.kt), mas com a
 * fonte padrão do sistema em vez de Open Sans.
 *
 * WHY: carregar fonte customizada no Compose Multiplatform 1.11 exige o
 * sistema novo de "Compose Resources" (`Res.font.xxx`, gerado a partir de
 * `composeResources/font/`) — a API antiga `Font(resource: String, ...)`
 * usada aqui antes foi removida/trocada nessa versão e só foi descoberta
 * porque o CI (rodando num Windows de verdade) recusou compilar; a próxima
 * tentativa mudaria a convenção de diretório/DSL de recursos do módulo
 * inteiro, então ficou fora do escopo desta entrega. Ver docs/DESKTOP.md.
 */
val VolanteTypography = Typography(
    displayLarge = TextStyle(fontSize = 57.sp, lineHeight = 64.sp, letterSpacing = (-0.25).sp),
    displayMedium = TextStyle(fontSize = 45.sp, lineHeight = 52.sp),
    displaySmall = TextStyle(fontSize = 36.sp, lineHeight = 44.sp),
    headlineLarge = TextStyle(fontSize = 32.sp, lineHeight = 40.sp),
    headlineMedium = TextStyle(fontSize = 28.sp, lineHeight = 36.sp),
    headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.15.sp),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.5.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.25.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.4.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.5.sp),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 16.sp, letterSpacing = 0.5.sp),
)
