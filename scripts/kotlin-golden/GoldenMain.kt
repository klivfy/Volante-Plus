package com.volanteplus.loterias.golden

import kotlin.system.exitProcess

/**
 * Executor local do teste dourado de paridade web–Kotlin — usado por
 * `scripts/kotlin-golden-check.sh` para validar a paridade com kotlinc puro,
 * sem Gradle e sem Android SDK (o ambiente de revisão não tem SDK; o CI
 * validará o mesmo arquivo via `./gradlew :shared:desktopTest`).
 *
 * Chama as mesmas funções que os `@Test` do `GoldenParityTest` e trata
 * qualquer `AssertionError` como divergência dourada (código de saída 1).
 * Não faz parte dos fontes do app: vive em `scripts/` e é compilado junto
 * apenas neste cheque local.
 */

private val checks: List<Pair<String, GoldenParityTest.() -> Unit>> = listOf(
    "rulesMatchLotteryModel" to GoldenParityTest::rulesMatchLotteryModel,
    "classificationGridMatchesPrizeRules" to GoldenParityTest::classificationGridMatchesPrizeRules,
    "exactTierProbabilitiesMatchBigIntegerRecomputation" to GoldenParityTest::exactTierProbabilitiesMatchBigIntegerRecomputation,
    "exactPrizeProbabilityMatchesSum" to GoldenParityTest::exactPrizeProbabilityMatchesSum,
    "expectedNumberHitsExact" to GoldenParityTest::expectedNumberHitsExact,
    "betOutcomesMatchClassification" to GoldenParityTest::betOutcomesMatchClassification,
    "closureDesignsVerifyExhaustively" to GoldenParityTest::closureDesignsVerifyExhaustively,
)

fun main() {
    var failures = 0
    for ((name, check) in checks) {
        try {
            GoldenParityTest().check()
            println("PASS $name")
        } catch (error: Throwable) {
            failures++
            println("FAIL $name: ${error.message}")
        }
    }
    if (failures == 0) {
        println("GOLDEN PARITY: 0 divergências web–Kotlin (${checks.size} verificações × 3 modalidades)")
    } else {
        println("GOLDEN PARITY: $failures verificação(ões) com divergência")
    }
    exitProcess(if (failures == 0) 0 else 1)
}
