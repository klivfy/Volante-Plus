package com.volanteplus.loterias.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Trava a partição das estratégias por evidência. Se alguém promover uma
 * hipótese a "comprovada" sem passar por aqui, este teste avisa.
 */
class GenerationStrategyEvidenceTest {

    @Test
    fun `apenas aleatorio e menos apostadas sao comprovadas`() {
        val proven = GenerationStrategy.entries.filter { it.evidence == EvidenceLevel.PROVEN }.toSet()
        assertEquals(setOf(GenerationStrategy.RANDOM, GenerationStrategy.UNPOPULAR), proven)
    }

    @Test
    fun `equilibrado e mais sorteadas ficam no grupo de hipoteses`() {
        val unproven = GenerationStrategy.entries.filter { it.evidence == EvidenceLevel.UNPROVEN }.toSet()
        assertEquals(setOf(GenerationStrategy.BALANCED, GenerationStrategy.FREQUENCY), unproven)
    }

    @Test
    fun `toda estrategia pertence a exatamente um grupo`() {
        val byLevel = GenerationStrategy.entries.groupBy { it.evidence }
        assertEquals(GenerationStrategy.entries.size, byLevel.values.sumOf { it.size })
    }

    @Test
    fun `grupo comprovado aparece antes das hipoteses na interface`() {
        // A ordem do enum define a ordem dos grupos na tela.
        assertTrue(EvidenceLevel.PROVEN.ordinal < EvidenceLevel.UNPROVEN.ordinal)
    }

    @Test
    fun `cada grupo tem nome e explicacao legiveis`() {
        EvidenceLevel.entries.forEach { level ->
            assertTrue(level.displayName.isNotBlank())
            assertTrue(level.explanation.length > 40)
        }
    }
}
