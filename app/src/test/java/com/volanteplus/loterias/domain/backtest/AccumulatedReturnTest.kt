package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.ContestOutlook
import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.pow
import kotlin.random.Random

class AccumulatedReturnTest {

    // ---- A fórmula do rateio ----

    @Test
    fun `soma do que cada aposta recebe e igual ao bolo vezes a chance de haver ganhador`() {
        // Identidade que valida a derivação: N × E[recebido por aposta] =
        // bolo × P(K ≥ 1). Se a fórmula estivesse errada, isto falharia.
        val pool = 1_000_000.0
        val p = 1.0 / 50_063_860
        val n = 30_000_000.0
        val perTicket = AccumulatedReturn.expectedShareOfPool(pool, p, n)
        val anyWinner = 1.0 - (1.0 - p).pow(n)
        assertEquals(pool * anyWinner, perTicket * n, 1e-3)
    }

    @Test
    fun `com uma unica aposta o esperado e probabilidade vezes bolo`() {
        val perTicket = AccumulatedReturn.expectedShareOfPool(1_000.0, 0.25, 1.0)
        assertEquals(250.0, perTicket, 1e-12)
    }

    @Test
    fun `formula analitica bate com simulacao Monte Carlo`() {
        // Cenário pequeno para a simulação convergir: 200 apostas, p = 1%.
        val pool = 10_000.0
        val p = 0.01
        val n = 200
        val analytic = AccumulatedReturn.expectedShareOfPool(pool, p, n.toDouble())

        val rng = Random(20260903)
        val replications = 200_000
        var total = 0.0
        repeat(replications) {
            // Minha aposta é a de índice 0; conto quantas das N acertam.
            var winners = 0
            var mineWon = false
            for (i in 0 until n) {
                if (rng.nextDouble() < p) {
                    winners++
                    if (i == 0) mineWon = true
                }
            }
            if (mineWon) total += pool / winners
        }
        val simulated = total / replications
        // Erro-padrão aproximado da simulação ≈ 3% do valor; tolerância folgada.
        assertTrue(
            "analítico=$analytic simulado=$simulated",
            abs(analytic - simulated) / analytic < 0.10,
        )
    }

    @Test
    fun `mais apostas concorrentes reduzem o que cada uma recebe`() {
        val pool = 5_000_000.0
        val p = 1.0 / 50_063_860
        val few = AccumulatedReturn.expectedShareOfPool(pool, p, 10_000_000.0)
        val many = AccumulatedReturn.expectedShareOfPool(pool, p, 60_000_000.0)
        assertTrue(few > many)
    }

    @Test
    fun `probabilidade de algum ganhador e estavel para p minusculo`() {
        val p = 1.0 / 50_063_860
        val n = 30_000_000.0
        val stable = AccumulatedReturn.probabilityOfAnyWinner(p, n)
        val naive = 1.0 - (1.0 - p).pow(n)
        assertEquals(naive, stable, 1e-9)
        // Sanidade: com N ≈ 0,6 × (1/p), P(≥1) = 1 − e^−0,6 ≈ 0,45.
        assertEquals(0.45, stable, 0.01)
    }

    // ---- Cobertura total (limiar de Mandel) ----

    @Test
    fun `combinacoes simples da Mega-Sena sao 50 063 860`() {
        assertEquals(50_063_860L, AccumulatedReturn.distinctSimpleBets(Lottery.MEGA_SENA))
    }

    @Test
    fun `combinacoes simples da Mais Milionaria incluem as 15 duplas de trevos`() {
        // C(50,6) = 15.890.700; × C(6,2) = 15.
        assertEquals(15_890_700L * 15, AccumulatedReturn.distinctSimpleBets(Lottery.MAIS_MILIONARIA))
    }

    @Test
    fun `custo de cobertura total e combinacoes vezes preco`() {
        assertEquals(
            50_063_860 * 6.0,
            AccumulatedReturn.fullCoverageCost(Lottery.MEGA_SENA),
            1e-6,
        )
    }

    // ---- Estimativa por concurso ----

    private fun outlook(
        accumulated: Double,
        collection: Double,
        lottery: Lottery = Lottery.MEGA_SENA,
    ) = ContestOutlook(
        lottery = lottery,
        lastContest = 2900,
        nextContest = 2901,
        nextDate = LocalDate.of(2026, 9, 5),
        accumulatedForNext = accumulated,
        estimatedTopPrize = accumulated + 3_000_000.0,
        lastCollection = collection,
        lastAccumulated = accumulated > 0.0,
    )

    @Test
    fun `sem arrecadacao nao ha estimativa`() {
        assertNull(AccumulatedReturn.estimate(outlook(accumulated = 1e8, collection = 0.0)))
    }

    @Test
    fun `sem acumulado o retorno esperado fica abaixo do preco`() {
        val e = AccumulatedReturn.estimate(outlook(accumulated = 0.0, collection = 180e6))!!
        assertEquals(0.0, e.accumulatedBonus, 1e-12)
        assertTrue(e.totalReturn < e.betPrice)
        assertFalse(e.isFavorable)
        // Teto teórico: nunca acima do retorno de longo prazo fixado em norma.
        val longRun = PrizeTable.expectedReturn(Lottery.MEGA_SENA).longRunReturn
        assertTrue(e.baseReturn <= longRun + 1e-9)
    }

    @Test
    fun `acumulado tipico nao torna a aposta favoravel`() {
        // R$ 50 milhões acumulados, arrecadação de R$ 180 milhões (≈ 30 M apostas).
        val e = AccumulatedReturn.estimate(outlook(accumulated = 50e6, collection = 180e6))!!
        assertTrue(e.accumulatedBonus > 0.0)
        assertTrue(e.totalReturn < e.betPrice)
        assertFalse(e.isFavorable)
    }

    @Test
    fun `bonus cresce linearmente com o acumulado`() {
        val a = AccumulatedReturn.estimate(outlook(accumulated = 10e6, collection = 180e6))!!
        val b = AccumulatedReturn.estimate(outlook(accumulated = 20e6, collection = 180e6))!!
        assertEquals(2.0, b.accumulatedBonus / a.accumulatedBonus, 1e-9)
        assertEquals(a.baseReturn, b.baseReturn, 1e-12)
    }

    @Test
    fun `no ponto de equilibrio o retorno esperado iguala o preco`() {
        val ref = AccumulatedReturn.estimate(outlook(accumulated = 0.0, collection = 180e6))!!
        val atBreakEven = AccumulatedReturn.estimate(
            outlook(accumulated = ref.breakEvenAccumulated, collection = 180e6),
        )!!
        assertEquals(atBreakEven.betPrice, atBreakEven.totalReturn, 1e-6)
        assertTrue(atBreakEven.isFavorable)
    }

    @Test
    fun `ponto de equilibrio da Mega-Sena e da ordem de centenas de milhoes`() {
        // Ordem de grandeza coerente com o limiar de Mandel (R$ 300 milhões
        // para cobrir tudo). Se saísse R$ 5 milhões ou R$ 50 bilhões, a
        // fórmula estaria errada.
        val e = AccumulatedReturn.estimate(outlook(accumulated = 0.0, collection = 180e6))!!
        assertTrue("break-even=${e.breakEvenAccumulated}", e.breakEvenAccumulated > 100e6)
        assertTrue("break-even=${e.breakEvenAccumulated}", e.breakEvenAccumulated < 1_000e6)
    }

    @Test
    fun `estimativa funciona para a Mais Milionaria`() {
        val e = AccumulatedReturn.estimate(
            outlook(accumulated = 30e6, collection = 40e6, lottery = Lottery.MAIS_MILIONARIA),
        )!!
        assertTrue(e.accumulatedBonus > 0.0)
        assertTrue(e.baseReturn > 0.0)
        assertTrue(e.totalReturn < e.betPrice)
    }
}
