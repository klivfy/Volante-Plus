package com.volanteplus.loterias.domain.backtest

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Referências conferidas contra `scipy.stats` e `math.lgamma`. */
class SpecialFunctionsTest {

    @Test
    fun `lnGamma reproduz fatoriais conhecidos`() {
        assertEquals(0.0, SpecialFunctions.lnGamma(1.0), 1e-12)
        assertEquals(0.0, SpecialFunctions.lnGamma(2.0), 1e-12)
        // Γ(6) = 120
        assertEquals(Math.log(120.0), SpecialFunctions.lnGamma(6.0), 1e-11)
        // Γ(1/2) = √π
        assertEquals(Math.log(Math.sqrt(Math.PI)), SpecialFunctions.lnGamma(0.5), 1e-11)
        // Γ(101) = 100!
        assertEquals(363.7393755555635, SpecialFunctions.lnGamma(101.0), 1e-9)
    }

    @Test
    fun `lnBinomial reproduz coeficientes exatos`() {
        assertEquals(Math.log(1.0), SpecialFunctions.lnBinomial(10, 0), 1e-12)
        assertEquals(Math.log(252.0), SpecialFunctions.lnBinomial(10, 5), 1e-10)
        // C(60,6) = 50.063.860
        assertEquals(Math.log(50_063_860.0), SpecialFunctions.lnBinomial(60, 6), 1e-9)
    }

    @Test
    fun `normalCdf bate com a referencia`() {
        val cases = mapOf(
            -3.0 to 0.0013498980,
            -1.959963985 to 0.0250000000,
            0.0 to 0.5,
            1.0 to 0.8413447461,
            1.959963985 to 0.9750000000,
            3.0 to 0.9986501020,
        )
        cases.forEach { (z, expected) ->
            assertEquals("Phi($z)", expected, SpecialFunctions.normalCdf(z), 1e-9)
        }
    }

    @Test
    fun `normalCdf e simetrica e monotona`() {
        var previous = 0.0
        var z = -5.0
        while (z <= 5.0) {
            val value = SpecialFunctions.normalCdf(z)
            assertTrue("monotonia em $z", value >= previous)
            assertEquals(1.0, value + SpecialFunctions.normalCdf(-z), 1e-12)
            previous = value
            z += 0.25
        }
    }

    @Test
    fun `normalQuantile inverte normalCdf`() {
        listOf(0.80 to 0.8416212336, 0.95 to 1.6448536270, 0.975 to 1.9599639845,
               0.995 to 2.5758293035).forEach { (p, expected) ->
            assertEquals("z($p)", expected, SpecialFunctions.normalQuantile(p), 1e-8)
        }
        assertEquals(0.0, SpecialFunctions.normalQuantile(0.5), 1e-12)

        // ida e volta
        listOf(0.001, 0.05, 0.3, 0.7, 0.95, 0.999).forEach { p ->
            val z = SpecialFunctions.normalQuantile(p)
            assertEquals(p, SpecialFunctions.normalCdf(z), 1e-9)
        }
    }

    @Test
    fun `chiSquareUpperTail bate com os valores criticos tabelados`() {
        // valores críticos a 5%: p deve ficar em 0,05
        assertEquals(0.05, SpecialFunctions.chiSquareUpperTail(3.841459, 1), 1e-6)
        assertEquals(0.05, SpecialFunctions.chiSquareUpperTail(11.070498, 5), 1e-6)
        assertEquals(0.05, SpecialFunctions.chiSquareUpperTail(12.591587, 6), 1e-6)
        // valores críticos a 1%
        assertEquals(0.01, SpecialFunctions.chiSquareUpperTail(6.634897, 1), 1e-6)
        assertEquals(0.01, SpecialFunctions.chiSquareUpperTail(15.086272, 5), 1e-6)
    }

    @Test
    fun `chiSquareUpperTail nos limites`() {
        // estatística nula ou negativa: nenhuma evidência contra a hipótese nula
        assertEquals(1.0, SpecialFunctions.chiSquareUpperTail(0.0, 3), 1e-12)
        assertEquals(1.0, SpecialFunctions.chiSquareUpperTail(-1.0, 3), 1e-12)
        // cauda extrema não retorna zero por underflow prematuro
        assertTrue(SpecialFunctions.chiSquareUpperTail(200.0, 3) < 1e-40)
        // graus de liberdade inválidos são um erro de programação, não um dado
        val error = runCatching { SpecialFunctions.chiSquareUpperTail(5.0, 0) }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
    }

    @Test
    fun `funcao gama regularizada soma um`() {
        listOf(0.5, 1.0, 2.5, 10.0).forEach { a ->
            listOf(0.1, 1.0, 5.0, 20.0).forEach { x ->
                val p = SpecialFunctions.regularizedGammaP(a, x)
                val q = SpecialFunctions.regularizedGammaQ(a, x)
                assertEquals("P+Q em a=$a x=$x", 1.0, p + q, 1e-12)
            }
        }
    }
}
