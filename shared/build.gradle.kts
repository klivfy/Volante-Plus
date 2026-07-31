import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Módulo Kotlin Multiplatform: domínio puro (backtesting, geração de jogos,
// modelos) compartilhado entre :app (Android) e :desktop (Compose
// Multiplatform). Os dois alvos rodam em JVM — não há iOS/JS/Native aqui —
// então não foi necessário nenhum `expect`/`actual`: o código em
// commonMain já compila igual nos dois, incluindo `java.time.*`.
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }
    jvm("desktop") {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
        }
    }
}

android {
    namespace = "com.volanteplus.loterias.shared"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
