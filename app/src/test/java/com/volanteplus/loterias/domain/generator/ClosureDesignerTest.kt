package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.GenerationStrategy
import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class ClosureDesignerTest {

    /**
     * Critério de aceite do documento: "fechamento por cobertura passa em
     * verificação exaustiva do pior caso". Percorre TODOS os C(v,4)
     * subconjuntos de cada desdobramento, não uma amostra.
     */
    @Test
    fun `todo fechamento de quadra cobre todos os quartetos`() {
        for (poolSize in ClosureDesigner.SUPPORTED_POOL_SIZES) {
            val design = ClosureDesigner.design(poolSize, ClosureGuarantee.QUADRA)
            assertNotNull("Sem desdobramento para pool de $poolSize", design)
            assertNull(
                "Quarteto descoberto no pool de $poolSize: ${ClosureDesigner.findUncovered(design!!)}",
                ClosureDesigner.findUncovered(design),
            )
        }
    }

    @Test
    fun `todo fechamento de terno cobre todos os ternos`() {
        for (poolSize in ClosureDesigner.SUPPORTED_POOL_SIZES) {
            val design = ClosureDesigner.design(poolSize, ClosureGuarantee.TERNO)!!
            assertNull(
                "Terno descoberto no pool de $poolSize",
                ClosureDesigner.findUncovered(design),
            )
        }
    }

    /** Contraprova: se a verificação sempre passasse, ela não valeria nada. */
    @Test
    fun `verificacao detecta desdobramento incompleto`() {
        val completo = ClosureDesigner.design(10, ClosureGuarantee.QUADRA)!!
        val mutilado = completo.copy(games = completo.games.dropLast(1))
        assertNotNull(
            "Remover um jogo deveria abrir um buraco na cobertura",
            ClosureDesigner.findUncovered(mutilado),
        )
        assertTrue(ClosureDesigner.verify(completo))
    }

    /**
     * O contraste que motiva a entrega: a regra de repetição mínima do
     * gerador NÃO garante quadra, ainda que pareça um fechamento.
     */
    @Test
    fun `repeticao minima nao garante quadra e o fechamento garante`() {
        val pool = (1..10).toList()
        val generator = GameGenerator(Random(20260903L))
        var falhasDoGerador = 0
        val tentativas = 50
        repeat(tentativas) {
            val batch = generator.generate(
                lottery = Lottery.MEGA_SENA,
                strategy = GenerationStrategy.RANDOM,
                gameCount = GameGenerator.MAX_GAMES,
                pool = pool,
            )
            val jogos = batch.games.map { it.numbers.toSet() }
            val descoberto = combinacoes(pool, 4).any { quarteto ->
                jogos.none { it.containsAll(quarteto) }
            }
            if (descoberto) falhasDoGerador++
        }
        assertEquals(
            "A regra de repetição mínima não deve ser vendida como garantia",
            tentativas,
            falhasDoGerador,
        )

        val fechamento = ClosureDesigner.design(10, ClosureGuarantee.QUADRA)!!
        val jogos = fechamento.apply(pool).map { it.numbers.toSet() }
        assertTrue(
            combinacoes(pool, 4).all { quarteto -> jogos.any { it.containsAll(quarteto) } },
        )
    }

    @Test
    fun `apply traduz indices para as dezenas marcadas`() {
        val pool = listOf(7, 13, 22, 31, 38, 44, 49, 55, 58, 60)
        val design = ClosureDesigner.design(10, ClosureGuarantee.QUADRA)!!
        val jogos = design.apply(pool)
        assertEquals(design.gameCount, jogos.size)
        jogos.forEach { jogo ->
            assertEquals(6, jogo.numbers.size)
            assertEquals(6, jogo.numbers.toSet().size)
            assertTrue("Dezena fora do pool em $jogo", pool.containsAll(jogo.numbers))
            assertEquals(jogo.numbers.sorted(), jogo.numbers)
        }
    }

    @Test
    fun `apply rejeita pool de tamanho errado`() {
        val design = ClosureDesigner.design(10, ClosureGuarantee.QUADRA)!!
        val erro = runCatching { design.apply(listOf(1, 2, 3)) }.exceptionOrNull()
        assertTrue(erro is IllegalArgumentException)
    }

    /** O custo cresce rápido: é a informação que o apostador precisa ver. */
    @Test
    fun `custo do fechamento e explicito e crescente`() {
        val catalogo = ClosureDesigner.catalog(ClosureGuarantee.QUADRA)
        assertEquals(ClosureDesigner.SUPPORTED_POOL_SIZES.count(), catalogo.size)
        catalogo.zipWithNext().forEach { (menor, maior) ->
            assertTrue(
                "Pool maior deveria custar mais: ${menor.contract} vs ${maior.contract}",
                maior.gameCount > menor.gameCount,
            )
        }
        val dez = catalogo.first { it.poolSize == 10 }
        assertEquals(dez.gameCount * 6.0, dez.totalCost, 1e-9)
        assertTrue(dez.contract.contains("quadra garantida"))
    }

    @Test
    fun `pool fora do intervalo suportado retorna nulo`() {
        assertNull(ClosureDesigner.design(6, ClosureGuarantee.QUADRA))
        assertNull(ClosureDesigner.design(16, ClosureGuarantee.QUADRA))
    }

    private fun combinacoes(fonte: List<Int>, tamanho: Int): List<Set<Int>> {
        if (tamanho == 0) return listOf(emptySet())
        if (fonte.size < tamanho) return emptyList()
        val cabeca = fonte.first()
        val resto = fonte.drop(1)
        return combinacoes(resto, tamanho - 1).map { it + cabeca } + combinacoes(resto, tamanho)
    }

    /**
     * Garantia validada sobre as dezenas reais que o apostador marcou, e não
     * sobre os índices internos do desdobramento. Este é o caminho que a tela
     * de Fechamento percorre: pool marcado -> apply() -> jogos.
     */
    @Test
    fun `garantia vale para as dezenas marcadas no volante`() {
        val marcadas = listOf(4, 8, 15, 16, 23, 42, 7, 11, 30, 55)
        val design = ClosureDesigner.design(marcadas.size, ClosureGuarantee.QUADRA)!!
        val jogos = design.apply(marcadas)

        assertEquals(design.gameCount, jogos.size)
        jogos.forEach { jogo ->
            assertEquals(6, jogo.numbers.size)
            assertEquals(jogo.numbers.sorted(), jogo.numbers)
            assertTrue(marcadas.containsAll(jogo.numbers))
        }

        // Toda quadra possível dentro das 10 dezenas marcadas aparece
        // inteira em pelo menos um jogo — verificação exaustiva.
        val conjuntos = jogos.map { it.numbers.toSet() }
        var quadras = 0
        val ordenadas = marcadas.sorted()
        for (a in 0 until ordenadas.size - 3) {
            for (b in a + 1 until ordenadas.size - 2) {
                for (c in b + 1 until ordenadas.size - 1) {
                    for (d in c + 1 until ordenadas.size) {
                        quadras++
                        val quadra = setOf(ordenadas[a], ordenadas[b], ordenadas[c], ordenadas[d])
                        assertTrue(
                            "Quadra $quadra não coberta por nenhum jogo",
                            conjuntos.any { it.containsAll(quadra) },
                        )
                    }
                }
            }
        }
        assertEquals(210, quadras)
    }

    /** O desdobramento não pode aceitar um pool de tamanho errado. */
    @Test
    fun `apply rejeita pool de tamanho incompativel`() {
        val design = ClosureDesigner.design(10, ClosureGuarantee.QUADRA)!!
        try {
            design.apply(listOf(1, 2, 3))
            fail("Deveria recusar um pool de 3 dezenas")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("10"))
        }
    }
}
