// Top-level build file: configuração de plugins compartilhada entre módulos.
plugins {
    alias(libs.plugins.android.application) apply false
    // Mantido explicitamente: KSP ainda não suporta o Kotlin embutido do
    // AGP 9 (ver android.builtInKotlin=false em gradle.properties).
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
