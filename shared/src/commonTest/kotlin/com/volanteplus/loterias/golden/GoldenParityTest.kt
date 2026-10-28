package com.volanteplus.loterias.golden

import com.volanteplus.loterias.domain.backtest.Hypergeometric
import com.volanteplus.loterias.domain.backtest.PrizeRules
import com.volanteplus.loterias.domain.backtest.PrizeTable
import com.volanteplus.loterias.domain.generator.ClosureDesigner
import com.volanteplus.loterias.domain.generator.ClosureGuarantee
import com.volanteplus.loterias.domain.model.Lottery
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import java.math.BigInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Teste dourado de paridade web–Kotlin (Fase 4 do plano de confiabilidade,
 * frente 1) — o lado Kotlin do circuito cuja fonte é
 * `web/src/engine/golden/goldenFixture.ts`.
 *
 * As fixtures versionadas em `resources/golden/` (um JSON por modalidade)
 * são geradas pelo motor
 * TypeScript (fonte de referência do plano) e versionadas: num/den exatos
 * como inteiros, grade de classificação em inteiros e entradas canônicas
 * fixadas. Este teste verifica que o motor compartilhado (Kotlin
 * Multiplatform, usado pelo app Android e pelo desktop) reproduz a MESMA
 * verdade matemática, no mesmo commit:
 *
 * - frações exatas recomputadas aqui com `java.math.BigInteger` (aritmética
 *   inteira, sem ponto flutuante no caminho) têm de ser IGUAIS às da
 *   fixture — comparação byte a byte de inteiros;
 * - o double do motor tem de concordar com a fração exata dentro da
 *   tolerância relativa declarada (1e-9) — cada plataforma confronta o seu
 *   próprio ponto flutuante com a verdade exata, porque os algoritmos de
 *   `lnBinomial` são deliberadamente diferentes entre as duas (Lanczos
 *   aqui, logFactorial acumulado lá);
 * - a grade de classificação (acertos → faixa) é igual em todos os casos;
 * - os fechamentos canônicos C(10, 6, 3) e C(10, 6, 4) são verificados por
 *   exaustão contra C(v, t) subconjuntos — as tabelas de covering design
 *   são diferentes entre as plataformas POR DECISÃO DE PROJETO (o que tem
 *   de coincidir é a garantia verificada, não o design em si);
 * - o preço da aposta simples por modalidade é igual ao da fixture.
 *
 * As funções `check*` não dependem de framework de teste (só stdlib) de
 * propósito: o mesmo arquivo roda no Gradle via `kotlin.test` e no script
 * local `scripts/kotlin-golden-check.sh` (kotlinc puro, sem Android SDK),
 * que chama cada função e trata `AssertionError` como divergência.
 *
 * Assimetria DECLARADA entre as plataformas (não é divergência): a UI
 * Kotlin oferece fechamento só para a Mega-Sena (guard em
 * `VolanteViewModel`); a web oferece para as três modalidades. As garantias
 * oferecidas pela web (`offeredGuarantees`) são subconjunto das que o
 * catálogo Kotlin tem designs para verificar.
 */
private const val FLOAT_TOLERANCE = 1e-9

/** C(n, k) exato em BigInteger — divisão passo a passo, prefixos binomiais. */
private fun bigBinomial(n: Long, k: Long): BigInteger {
    if (k < 0 || n < 0 || k > n) return BigInteger.ZERO
    var result = BigInteger.ONE
    for (i in 1..k) {
        result = result.multiply(BigInteger.valueOf(n - k + i)).divide(BigInteger.valueOf(i))
    }
    return result
}

/** mdc de BigInteger (Euclides) — para reduzir a fração à forma canônica. */
private fun bigGcd(a: BigInteger, b: BigInteger): BigInteger {
    var x = a.abs()
    var y = b.abs()
    while (y.signum() > 0) {
        val r = x.mod(y)
        x = y
        y = r
    }
    return x
}

/** Reduz num/den (den > 0) à forma canônica; fração nula vira 0/1. */
private fun reduceFraction(num: BigInteger, den: BigInteger): Pair<BigInteger, BigInteger> {
    if (num.signum() == 0) return BigInteger.ZERO to BigInteger.ONE
    val g = bigGcd(num, den)
    val sign = if (den.signum() < 0) -1L else 1L
    return num.divide(g).multiply(BigInteger.valueOf(sign)) to
        den.divide(g).multiply(BigInteger.valueOf(sign))
}

/** Obj raiz da fixture versionada. */
private fun loadFixture(key: String): JsonObject {
    val text = GoldenParityTest::class.java.getResourceAsStream("/golden/$key.json")
        ?.bufferedReader(Charsets.UTF_8)?.readText()
        ?: error("Fixture ausente do classpath de teste: /golden/$key.json")
    return Json.parseToJsonElement(text).jsonObject
}

private fun JsonObject.obj(key: String): JsonObject = getValue(key).jsonObject
private fun JsonObject.arr(key: String) = getValue(key).jsonArray
private fun JsonObject.str(key: String): String = getValue(key).jsonPrimitive.content
private fun JsonObject.intOf(key: String): Int = getValue(key).jsonPrimitive.int
private fun JsonObject.longOf(key: String): Long = getValue(key).jsonPrimitive.long
private fun JsonObject.doubleOf(key: String): Double = getValue(key).jsonPrimitive.double
private fun JsonObject.boolOf(key: String): Boolean = getValue(key).jsonPrimitive.boolean

/** Chave da faixa premiada da web, ou null quando o JSON traz null literal. */
private fun JsonObject.tierKeyOrNull(): String? =
    when (val value = getValue("tier")) {
        is JsonNull -> null
        else -> value.jsonPrimitive.content
    }

/** Fração (num, den) de um objeto {"numerator": "...", "denominator": "..."}. */
private fun JsonObject.fraction(): Pair<BigInteger, BigInteger> =
    BigInteger(str("numerator")) to BigInteger(str("denominator"))

private val GOLDEN_KEYS = listOf("megasena", "maismilionaria", "quina")

private fun lotteryOf(key: String): Lottery = when (key) {
    "megasena" -> Lottery.MEGA_SENA
    "maismilionaria" -> Lottery.MAIS_MILIONARIA
    "quina" -> Lottery.QUINA
    else -> error("Modalidade desconhecida na fixture: $key")
}

/**
 * Faixa oficial da +Milionária (1..10) para cada chave de faixa da web —
 * a tabela oficial do regulamento, espelhada em `PrizeRules.kt`. As faixas
 * 2, 4 e 6 premiam com "1 ou 0 trevo", então cada uma cobre DUAS chaves da
 * web (a web desdobra `6+1` e `6+0` em entradas separadas).
 */
private val MAIS_MILIONARIA_FAIXA_OFICIAL = mapOf(
    "6+2" to 1, "6+1" to 2, "6+0" to 2,
    "5+2" to 3, "5+1" to 4, "5+0" to 4,
    "4+2" to 5, "4+1" to 6, "4+0" to 6,
    "3+2" to 7, "3+1" to 8,
    "2+2" to 9, "2+1" to 10,
)

/** Funções de verificação — cada uma é um teste independente. */
class GoldenParityTest {

    // ---- Regras da modalidade ----

    fun checkRules(fixture: JsonObject) {
        val lottery = lotteryOf(fixture.str("lottery"))
        val rules = fixture.obj("rules")
        assertEquals(lottery.numberRange.count(), rules.intOf("numberUniverse"), "universo")
        assertEquals(lottery.numbersDrawn, rules.intOf("numbersDrawn"), "dezenas sorteadas")
        assertEquals(lottery.numbersDrawn, rules.intOf("numbersPerBet"), "aposta simples")
        assertEquals(if (lottery.hasTrevos) Lottery.TREVO_RANGE.count() else 0, rules.intOf("trevoUniverse"), "universo de trevos")
        assertEquals(if (lottery.hasTrevos) Lottery.TREVOS_REQUIRED else 0, rules.intOf("trevosDrawn"), "trevos sorteados")
        assertEquals(if (lottery.hasTrevos) Lottery.TREVOS_REQUIRED else 0, rules.intOf("trevosPerBet"), "trevos por aposta")
        assertEquals(lottery.minSelection, rules.intOf("minSelection"), "seleção mínima")
        assertEquals(lottery.maxSelection, rules.intOf("maxSelection"), "seleção máxima")
        assertEquals(PrizeTable.betPrice(lottery), rules.doubleOf("betPriceBrl"), "preço da aposta simples")
    }

    // ---- Grade de classificação (acertos → faixa) ----

    fun checkClassification(fixture: JsonObject) {
        val lottery = lotteryOf(fixture.str("lottery"))
        val tierKeys = fixture.arr("tiers").map { it.jsonObject.str("key") }
        for (row in fixture.arr("classification").map { it.jsonObject }) {
            val numberHits = row.intOf("numberHits")
            val trevoHits = row.intOf("trevoHits")
            val webKey = row.tierKeyOrNull()
            val kotlinIndex = PrizeRules.tierIndex(lottery, numberHits, trevoHits)
            assertEquals(
                webKey != null,
                PrizeRules.isPrize(lottery, numberHits, trevoHits),
                "prêmio para $numberHits+$trevoHits",
            )
            if (webKey == null) {
                assertEquals(null, kotlinIndex, "Kotlin premia $numberHits+$trevoHits; web não premia")
            } else if (lottery == Lottery.MAIS_MILIONARIA) {
                val official = MAIS_MILIONARIA_FAIXA_OFICIAL[webKey]
                    ?: error("Chave de faixa sem faixa oficial mapeada: $webKey")
                assertEquals(official, kotlinIndex, "faixa oficial de $numberHits+$trevoHits")
            } else {
                // Sem trevo: 1:1 — o índice 1-based do Kotlin é a posição da
                // chave na lista de faixas da fixture (da mais alta para a mais baixa).
                val position = tierKeys.indexOf(webKey) + 1
                assertEquals(position, kotlinIndex, "faixa de $numberHits acertos")
            }
        }
    }

    // ---- Frações exatas por faixa ----

    /**
     * Fração exata da faixa, recomputada em BigInteger a partir dos
     * parâmetros (N, K, n) da própria fixture — a mesma matemática de
     * `auditExact.ts`, refeita na outra plataforma e outra linguagem.
     */
    private fun exactTierFraction(rules: JsonObject, key: String): Pair<BigInteger, BigInteger> {
        val sep = key.indexOf('+')
        val numberHits = if (sep >= 0) key.take(sep).toLong() else key.toLong()
        val trevoHits = if (sep >= 0) key.substring(sep + 1).toLong() else 0L
        val bigN = rules.longOf("numberUniverse")
        val bigK = rules.longOf("numbersDrawn")
        val bigNbet = rules.longOf("numbersPerBet")

        var num = bigBinomial(bigK, numberHits).multiply(bigBinomial(bigN - bigK, bigNbet - numberHits))
        var den = bigBinomial(bigN, bigNbet)
        if (sep >= 0) {
            num = num.multiply(bigBinomial(2, trevoHits).multiply(bigBinomial(4, 2 - trevoHits)))
            den = den.multiply(bigBinomial(6, 2))
        }
        return reduceFraction(num, den)
    }

    /** Probabilidade da faixa pelo double do motor Kotlin (`Hypergeometric`). */
    private fun engineTierProbability(
        lottery: Lottery,
        numberHits: Int,
        trevoHits: Int,
        comTrevo: Boolean,
    ): Double {
        val numbers = Hypergeometric.probability(
            lottery.numberRange.count(),
            lottery.numbersDrawn,
            lottery.numbersDrawn,
            numberHits,
        )
        return if (!comTrevo) numbers else numbers * Hypergeometric.trevoProbability(trevoHits)
    }

    fun checkExactTierProbabilities(fixture: JsonObject) {
        val rules = fixture.obj("rules")
        val lottery = lotteryOf(fixture.str("lottery"))
        for (entry in fixture.arr("exactTierProbabilities").map { it.jsonObject }) {
            val key = entry.str("tier")
            val (rn, rd) = exactTierFraction(rules, key)
            assertEquals(rn.toString(), entry.str("numerator"), "numerador da faixa $key")
            assertEquals(rd.toString(), entry.str("denominator"), "denominador da faixa $key")

            // O double do motor tem de concordar com a verdade exata (1e-9).
            val exact = rn.toDouble() / rd.toDouble()
            val sep = key.indexOf('+')
            val numberHits = if (sep >= 0) key.take(sep).toInt() else key.toInt()
            val trevoHits = if (sep >= 0) key.substring(sep + 1).toInt() else 0
            val engine = engineTierProbability(lottery, numberHits, trevoHits, sep >= 0)
            val deviation = Math.abs(engine - exact) / Math.abs(exact)
            assertTrue(deviation <= FLOAT_TOLERANCE, "double do motor diverge da fração exata na faixa $key: $engine vs $exact")
        }
    }

    // ---- Soma exata da probabilidade de prêmio ----

    fun checkExactPrizeProbability(fixture: JsonObject) {
        val (expectedNum, expectedDen) = fixture.obj("exactPrizeProbability").fraction()

        // Soma as frações da fixture e reduz — tem de reproduzir a total exata.
        var num = BigInteger.ZERO
        var den = BigInteger.ONE
        var total = 0.0
        for (entry in fixture.arr("exactTierProbabilities").map { it.jsonObject }) {
            val (tn, td) = entry.fraction()
            num = num.multiply(td).add(tn.multiply(den))
            den = den.multiply(td)
            total += tn.toDouble() / td.toDouble()
        }
        val (rn, rd) = reduceFraction(num, den)
        assertEquals(expectedNum, rn, "numerador da soma exata")
        assertEquals(expectedDen, rd, "denominador da soma exata")

        // A soma em double das faixas tem de bater com a fração exata (1e-9).
        val exact = rn.toDouble() / rd.toDouble()
        val deviation = Math.abs(total - exact) / Math.abs(exact)
        assertTrue(deviation <= FLOAT_TOLERANCE, "soma em double diverge da exata: $total vs $exact")
    }

    // ---- E[acertos] = K·n/N ----

    fun checkExpectedNumberHits(fixture: JsonObject) {
        val rules = fixture.obj("rules")
        val (en, ed) = fixture.obj("exactExpectedNumberHits").fraction()
        val (rn, rd) = reduceFraction(
            BigInteger.valueOf(rules.longOf("numbersDrawn") * rules.longOf("numbersPerBet")),
            BigInteger.valueOf(rules.longOf("numberUniverse")),
        )
        assertEquals(rn, en, "numerador de E[acertos]")
        assertEquals(rd, ed, "denominador de E[acertos]")

        val engineMean = Hypergeometric.meanFor(lotteryOf(fixture.str("lottery")))
        val exact = en.toDouble() / ed.toDouble()
        val deviation = Math.abs(engineMean - exact) / Math.abs(exact)
        assertTrue(deviation <= 1e-12, "média do motor diverge do exato: $engineMean vs $exact")
    }

    // ---- Resultados dos pares (aposta, concurso) ----

    fun checkBetOutcomes(fixture: JsonObject) {
        val lottery = lotteryOf(fixture.str("lottery"))
        val bets = fixture.arr("canonicalBets").map { b -> b.jsonArray.map { it.jsonPrimitive.int } }
        val betsTrevos = fixture.arr("canonicalBetsTrevos").map { b -> b.jsonArray.map { it.jsonPrimitive.int } }
        val draws = fixture.arr("canonicalDraws").map { d ->
            val obj = d.jsonObject
            Triple(
                obj.intOf("contestNumber"),
                obj.arr("numbers").map { it.jsonPrimitive.int },
                obj.arr("trevos").map { it.jsonPrimitive.int },
            )
        }
        val outcomes = fixture.arr("betOutcomes").map { it.jsonObject }
        assertEquals(bets.size * draws.size, outcomes.size, "cobertura de todos os pares")

        for (outcome in outcomes) {
            val bet = bets[outcome.intOf("betIndex")]
            val (contest, numbers, trevos) = draws[outcome.intOf("drawIndex")]
            val numberHits = bet.count(numbers::contains)
            assertEquals(numberHits, outcome.intOf("numberHits"), "acertos de dezenas (concurso $contest)")
            val trevoHits = if (lottery.hasTrevos) betsTrevos[outcome.intOf("betIndex")].count(trevos::contains) else 0
            assertEquals(trevoHits, outcome.intOf("trevoHits"), "acertos de trevos (concurso $contest)")
            assertEquals(
                PrizeRules.isPrize(lottery, numberHits, trevoHits),
                outcome.boolOf("prized"),
                "prêmio do par (concurso $contest)",
            )
        }
    }

    // ---- Fechamentos: garantia verificada por exaustão ----

    fun checkClosureCases(fixture: JsonObject) {
        for (closureCase in fixture.arr("closureCases").map { it.jsonObject }) {
            val guarantee = when (closureCase.intOf("guarantee")) {
                3 -> ClosureGuarantee.TERNO
                4 -> ClosureGuarantee.QUADRA
                else -> error("Garantia sem design no Kotlin: ${closureCase.intOf("guarantee")}")
            }
            val poolSize = closureCase.arr("pool").size
            val t = closureCase.longOf("guarantee")
            val expectedSubsets = closureCase.longOf("totalSubsets")
            assertEquals(bigBinomial(poolSize.toLong(), t).longValueExact(), expectedSubsets, "C(v,t) declarado")
            val design = assertNotNull(
                ClosureDesigner.design(poolSize, guarantee),
                "sem design C($poolSize,6,$t) no catálogo Kotlin",
            )
            assertTrue(
                ClosureDesigner.verify(design),
                "design C($poolSize,6,$t) não passou na verificação exaustiva",
            )
        }
    }

    @Test
    fun rulesMatchLotteryModel() = GOLDEN_KEYS.forEach { checkRules(loadFixture(it)) }

    @Test
    fun classificationGridMatchesPrizeRules() = GOLDEN_KEYS.forEach { checkClassification(loadFixture(it)) }

    @Test
    fun exactTierProbabilitiesMatchBigIntegerRecomputation() =
        GOLDEN_KEYS.forEach { checkExactTierProbabilities(loadFixture(it)) }

    @Test
    fun exactPrizeProbabilityMatchesSum() = GOLDEN_KEYS.forEach { checkExactPrizeProbability(loadFixture(it)) }

    @Test
    fun expectedNumberHitsExact() = GOLDEN_KEYS.forEach { checkExpectedNumberHits(loadFixture(it)) }

    @Test
    fun betOutcomesMatchClassification() = GOLDEN_KEYS.forEach { checkBetOutcomes(loadFixture(it)) }

    @Test
    fun closureDesignsVerifyExhaustively() = GOLDEN_KEYS.forEach { checkClosureCases(loadFixture(it)) }
}
