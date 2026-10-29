import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.kotlin.compose)
}

kotlin {
    jvm("desktop") {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    sourceSets {
        val desktopMain by getting {
            // Remapeado de src/desktopMain/kotlin (padrão do Kotlin
            // Multiplatform) para src/main/kotlin: este módulo só tem um
            // alvo JVM real (desktop), então o layout de um projeto Kotlin
            // comum é mais direto que a convenção multiplataforma completa.
            kotlin.srcDir("src/main/kotlin")
            resources.srcDir("src/main/resources")
            dependencies {
                implementation(compose.desktop.currentOs)
                implementation(compose.material3)
                implementation(compose.materialIconsExtended)
                implementation(libs.kotlinx.coroutines.core)
                implementation(project(":shared"))
            }
        }
        val desktopTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.coroutines.test)
            }
        }
    }
}

compose.desktop {
    application {
        mainClass = "com.volanteplus.desktop.MainKt"

        nativeDistributions {
            targetFormats(TargetFormat.Msi, TargetFormat.Exe)
            packageName = "VolantePlus"
            // Lido de gradle.properties (app.version) — versão do instalador
            // desktop, independente do versionName do Android.
            packageVersion = project.property("app.version") as String

            windows {
                menuGroup = "Volante+"
                // Gerado uma única vez (31/07/2026) — nunca trocar entre
                // releases: é esse UUID que permite ao instalador MSI
                // reconhecer uma instalação existente e fazer upgrade em vez
                // de duplicar a entrada em "Aplicativos e recursos".
                upgradeUuid = "a62a01fd-1cde-4f97-8941-e55fe8722911"
                iconFile.set(project.file("src/main/resources/icon.ico"))
            }
        }
    }
}
