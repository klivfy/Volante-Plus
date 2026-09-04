import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    // Mantido explicitamente: KSP ainda não suporta o Kotlin embutido do
    // AGP 9 (ver android.builtInKotlin=false em gradle.properties).
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

// Credenciais de assinatura do release: NUNCA hardcoded no build.gradle.kts.
// Lidas de keystore.properties (arquivo local, fora do git — ver .gitignore)
// com fallback para variáveis de ambiente, para funcionar também em CI
// (ex.: GitHub Actions com secrets). Se nenhuma fonte estiver disponível,
// o release simplesmente não é assinado (assembleRelease ainda funciona,
// só gera um APK sem assinatura, útil para checagens locais de build).
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        keystorePropsFile.inputStream().use { load(it) }
    }
}
fun signingProp(key: String, envVar: String): String? =
    keystoreProps.getProperty(key) ?: System.getenv(envVar)

android {
    namespace = "com.volanteplus.loterias"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.volanteplus.loterias"
        minSdk = 26
        targetSdk = 37
        // versionCode incrementado para 2 para v2.1 (inclui todas as 10 features implementadas
        // na web/src e backend integrado via Kotlin/Compose)
        versionCode = 2
        versionName = "2.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    val releaseStoreFile = signingProp("storeFile", "VOLANTEPLUS_STORE_FILE")
    val releaseStorePassword = signingProp("storePassword", "VOLANTEPLUS_STORE_PASSWORD")
    val releaseKeyAlias = signingProp("keyAlias", "VOLANTEPLUS_KEY_ALIAS")
    val releaseKeyPassword = signingProp("keyPassword", "VOLANTEPLUS_KEY_PASSWORD")
    val hasReleaseSigning = listOf(releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword)
        .all { !it.isNullOrBlank() }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
}

// Plugin kotlin-android explícito (não built-in): a configuração do
// compilador Kotlin usa a extensão kotlin {} com compilerOptions {},
// substituindo o antigo bloco kotlinOptions {} (deprecado no KGP 2.2+).
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    // Ícones extras (Paid, Refresh etc.) além do conjunto core que já vem
    // transitivamente com material3/ui — versão fixada pelo BOM do Compose.
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.room.runtime)
    ksp(libs.androidx.room.compiler)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.room.testing)
    androidTestImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
