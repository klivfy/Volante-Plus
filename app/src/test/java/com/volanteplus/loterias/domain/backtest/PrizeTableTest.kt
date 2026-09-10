package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.model.Lottery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PrizeTableTest {

    /**
     * Valor de referência independente: 0,4335 × R$ 6,00 = R$ 2,601, calculado
     * do percentual normativo, não extraído da implementação.
     */
    @Test
    fun `retorno esperado de longo prazo e o percentual normativo vezes o preco`() {
        val mega = PrizeTable.expectedReturn(Lottery.MEGA_SENA)
        assertEquals(2.601, mega.longRunReturn, 1e-9)
        assertEquals(6.0, mega.betPrice, 1e-9)
        assertEquals(3.399, mega.expectedLoss, 1e-9)
        assertEquals(0.5665, mega.houseEdge, 1e-9)
    }

    /** O resultado central: nenhuma aposta tem retorno esperado positivo. */
    @Test
    fun `retorno esperado e negativo nas duas loterias`() {
        Lottery.values().forEach { lottery ->
            val retorno = PrizeTable.expectedReturn(lottery)
            assertTrue(
                "$lottery deveria ter retorno esperado abaixo do preço da aposta",
                retorno.longRunReturn < retorno.betPrice,
            )
            assertTrue(retorno.expectedLoss > 0.0)
        }
    }

    /**
     * O retorno esperado não depende de estratégia porque não depende de nada
     * que o apostador escolha — só do percentual fixado em norma.
     */
    @Test
    fun `retorno esperado nao depende de quantas apostas sao feitas por aposta`() {
        val retorno = PrizeTable.expectedReturn(Lottery.MEGA_SENA)
        assertEquals(retorno.expectedLoss * 1000, retorno.expectedLossFor(1000), 1e-9)
        assertEquals(3399.0, retorno.expectedLossFor(1000), 1e-6)
    }

    @Test
    fun `mega-sena tem tres faixas com as probabilidades exatas`() {
        val faixas = PrizeTable.tiers(Lottery.MEGA_SENA)
        assertEquals(3, faixas.size)
        // C(60,6) = 50.063.860
        assertEquals(1.0 / 50_063_860.0, faixas[0].probability, 1e-15)
        assertEquals(50_063_860.0, faixas[0].oneIn, 1e-3)
        // C(6,5)*C(54,1)/C(60,6) = 324/50063860
        assertEquals(324.0 / 50_063_860.0, faixas[1].probability, 1e-15)
        // C(6,4)*C(54,2)/C(60,6) = 15*1431/50063860
        assertEquals(15 * 1431.0 / 50_063_860.0, faixas[2].probability, 1e-15)
    }

    /** Os percentuais de rateio da Portaria SPA/MF 1.656/2025 somam 100%. */
    @Test
    fun `percentuais de rateio da mega-sena somam cem por cento`() {
        val rateio = PrizeTable.tiers(Lottery.MEGA_SENA).sumOf { faixa ->
            (faixa.payout as Payout.Share).fraction
        }
        val total = rateio + PrizeTable.MEGA_ACCUMULATED_SHARE + PrizeTable.MEGA_VIRADA_SHARE
        assertEquals(1.0, total, 1e-12)
        assertEquals(0.68, rateio, 1e-12)
    }

    @Test
    fun `milionaria tem dez faixas e quatro sao de valor fixo`() {
        val faixas = PrizeTable.tiers(Lottery.MAIS_MILIONARIA)
        assertEquals(10, faixas.size)
        assertEquals(4, faixas.count { it.payout is Payout.Fixed })
        val rateio = faixas.filterIsInstance<PrizeTier>()
            .mapNotNull { (it.payout as? Payout.Share)?.fraction }
        assertEquals(6, rateio.size)
        assertEquals(1.0, rateio.sum(), 1e-12)
    }

    /**
     * Retorno das faixas fixas, calculado à mão a partir das probabilidades
     * exatas: p(3,2)*50 + p(3,1)*24 + p(2,2)*12 + p(2,1)*6.
     */
    @Test
    fun `retorno das faixas fixas da milionaria bate com o calculo direto`() {
        val d = Hypergeometric.distributionFor(Lottery.MAIS_MILIONARIA)
        val t2 = Hypergeometric.trevoProbability(2)
        val t1 = Hypergeometric.trevoProbability(1)
        val esperado = d[3]!! * t2 * 50.0 +
            d[3]!! * t1 * 24.0 +
            d[2]!! * t2 * 12.0 +
            d[2]!! * t1 * 6.0
        val retorno = PrizeTable.expectedReturn(Lottery.MAIS_MILIONARIA)
        assertEquals(esperado, retorno.fixedTierReturn, 1e-12)
        assertTrue(
            "Faixas fixas sozinhas não podem devolver mais que o prêmio bruto",
            retorno.fixedTierReturn < retorno.longRunReturn,
        )
    }

    /** A soma das probabilidades das faixas é a probabilidade de prêmio. */
    @Test
    fun `soma das faixas bate com a probabilidade de premio`() {
        Lottery.values().forEach { lottery ->
            assertEquals(
                Hypergeometric.prizeProbabilityFor(lottery),
                PrizeTable.expectedReturn(lottery).prizeProbability,
                1e-12,
            )
        }
    }

    @Test
    fun `faixas da mega-sena vao da mais dificil para a mais facil`() {
        val probabilidades = PrizeTable.tiers(Lottery.MEGA_SENA).map { it.probability }
        assertEquals(probabilidades.sorted(), probabilidades)
    }

    /**
     * Achado real, não defeito: a ordem oficial das faixas da +Milionária
     * **não** é monótona na probabilidade. A faixa 8 (3 dezenas + 1 trevo,
     * p ≈ 0,008890) é mais provável que a faixa 9 (2 dezenas + 2 trevos,
     * p ≈ 0,008543), embora venha antes na numeração do regulamento — e a
     * faixa 8 paga R$ 24,00 contra R$ 12,00 da faixa 9.
     *
     * Ou seja, uma faixa de número menor pode ser ao mesmo tempo mais fácil
     * e mais bem paga. Quem assume que "faixa mais alta = mais difícil" erra
     * aqui, e o teste existe para travar essa suposição.
     */
    @Test
    fun `ordem oficial da milionaria nao e monotona na probabilidade`() {
        val faixas = PrizeTable.tiers(Lottery.MAIS_MILIONARIA)
        val faixa8 = faixas.single { it.index == 8 }
        val faixa9 = faixas.single { it.index == 9 }
        assertTrue(
            "Faixa 8 deveria ser mais provável que a faixa 9",
            faixa8.probability > faixa9.probability,
        )
        assertEquals(24.0, (faixa8.payout as Payout.Fixed).amount, 1e-12)
        assertEquals(12.0, (faixa9.payout as Payout.Fixed).amount, 1e-12)

        // Fora dessa única inversão, a ordem cresce como se espera.
        val semA9 = faixas.filter { it.index != 9 }.map { it.probability }
        assertEquals(semA9.sorted(), semA9)
    }
    /**
     * A invariante que o modelo anterior violava: a +Milionária distribuía
     * R$ 3,3825 por aposta de um bolo de R$ 2,6010 — 30% a mais do que
     * existe. Vale para toda loteria e não pode regredir.
     */
    @Test
    fun `nenhuma loteria distribui mais premio do que o bolo disponivel`() {
        Lottery.entries.forEach { lottery ->
            val er = PrizeTable.expectedReturn(lottery)
            assertTrue(
                "${lottery.displayName} paga R$ ${er.immediateReturn} de um bolo de R$ ${er.longRunReturn}",
                er.immediateReturn <= er.longRunReturn + 1e-9,
            )
            assertTrue("Parcela diferida negativa em $lottery", er.deferredReturn >= -1e-9)
            assertEquals(
                er.immediateReturn,
                er.fixedTierReturn + er.shareTierReturn,
                1e-12,
            )
        }
    }

    @Test
    fun `mega-sena paga as tres faixas e acumula o restante`() {
        val er = PrizeTable.expectedReturn(Lottery.MEGA_SENA)
        assertEquals(ShareBase.GROSS_PRIZE, er.shareBase)
        assertEquals(0.0, er.fixedTierReturn, 1e-12)
        // 40% + 13% + 15% do bolo bruto
        assertEquals(er.longRunReturn * 0.68, er.shareTierReturn, 1e-9)
        assertEquals(0.68, er.immediateShareOfPrize, 1e-9)
    }

    @Test
    fun `milionaria deduz os premios fixos antes de ratear`() {
        val er = PrizeTable.expectedReturn(Lottery.MAIS_MILIONARIA)
        assertEquals(ShareBase.NET_OF_FIXED_AND_RESERVE, er.shareBase)
        assertTrue("Deveria haver retorno de faixas fixas", er.fixedTierReturn > 0.0)

        val rateavel = (er.longRunReturn - er.fixedTierReturn) * (1.0 - er.reserveShare)
        assertEquals(rateavel, PrizeTable.shareablePoolPerBet(Lottery.MAIS_MILIONARIA), 1e-12)
        // as frações das faixas de rateio somam 1,0 sobre essa base
        assertEquals(rateavel, er.shareTierReturn, 1e-9)
        assertTrue("Sobrou menos que a reserva", er.deferredReturn > 0.0)
    }

}
