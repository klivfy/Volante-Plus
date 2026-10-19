import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    // Mantido explicitamente em vez do Kotlin embutido do AGP: o KSP (Room)
    // depende do plugin kotlin-android aplicado. Na migração para o AGP 9 o
    // flag `android.builtInKotlin` precisa ir para false em gradle.properties
    // — hoje a propriedade não existe lá porque o AGP 8.7.3 não a tem.
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
    // AGP 8.7.3 (ver gradle/libs.versions.toml) só foi testado até compileSdk
    // 35 — a PR #4 subiu para 37 junto com a migração para AGP 9.4.0, que
    // não foi adotada aqui (ver histórico do merge). Manter os dois em sync.
    compileSdk = 35

    defaultConfig {
        applicationId = "com.volanteplus.loterias"
        minSdk = 26
        targetSdk = 35
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

// Schema do Room versionado em app/schemas/ (exportSchema = true em
// VolanteDatabase). É o insumo obrigatório para escrever e testar uma
// Migration quando a versão do banco subir.
ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
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
