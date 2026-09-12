package com.volanteplus.loterias.domain.backtest

import com.volanteplus.loterias.domain.generator.GameGenerator
import com.volanteplus.loterias.domain.model.Draw
import com.volanteplus.loterias.domain.model.Lottery
import com.volanteplus.loterias.data.repository.InMemoryDrawRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import kotlin.random.Random

/**
 * Critérios de aceite do documento `docs/refinamento-estatistico.md`.
 *
 * Estes testes não verificam unidades isoladas: eles rodam o laboratório
 * inteiro contra um histórico sorteado de verdade e conferem que ele chega às
 * conclusões corretas. É aqui que a tese do app é posta à prova — se uma
 * estratégia qualquer aparecesse como vencedora sobre sorteios genuinamente
 * aleatórios, o app estaria mentindo.
 */
class AcceptanceCriteriaTest {

    private val cutoff: LocalDate = LocalDate.of(2020, 1, 1)

    /**
     * Histórico sintético com sorteios genuinamente uniformes: 6 dezenas
     * distintas sorteadas sem reposição, exatamente como a hipótese nula.
     */
    private suspend fun historicoAleatorio(
        lottery: Lottery,
        concursos: Int,
        semente: Int,
    ): InMemoryDrawRepository {
        val rng = Random(semente)
        val repo = InMemoryDrawRepository()
        val universo = lottery.numberRange.toList()
        val draws = (1..concursos).map { i ->
            Draw(
                lottery = lottery,
                contestNumber = i,
                date = cutoff.plusDays(i.toLong()),
                numbers = universo.shuffled(rng).take(Draw.NUMBERS_DRAWN).sorted(),
                trevos = if (lottery.hasTrevos) {
                    Lottery.TREVO_RANGE.toList().shuffled(rng).take(Lottery.TREVOS_REQUIRED).sorted()
                } else {
                    emptyList()
                },
            )
        }
        // primeiros 20% viram janela de treino
        val corte = concursos / 5
        repo.upsertAll(draws.take(corte).map { it.copy(date = cutoff.minusDays(1)) })
        repo.upsertAll(draws.drop(corte))
        return repo
    }

    /**
     * Critério 1 — "baseline teórico bate com a tabela da §1, tolerância 1e-9".
     */
    @Test
    fun `baseline teorico bate com a tabela do documento`() {
        assertEquals(0.600, Hypergeometric.meanFor(Lottery.MEGA_SENA), 1e-9)
        assertEquals(0.4942372881, Hypergeometric.varianceFor(Lottery.MEGA_SENA), 1e-9)
        assertEquals(0.7030201192, Hypergeometric.stdDeviationFor(Lottery.MEGA_SENA), 1e-9)
        assertEquals(0.720, Hypergeometric.meanFor(Lottery.MAIS_MILIONARIA), 1e-9)
        assertEquals(0.5689469388, Hypergeometric.varianceFor(Lottery.MAIS_MILIONARIA), 1e-9)

        val d = Hypergeometric.distributionFor(Lottery.MEGA_SENA)
        assertEquals(0.5158844124, d[0]!!, 1e-9)
        assertEquals(0.3790171193, d[1]!!, 1e-9)
        assertEquals(0.0947542798, d[2]!!, 1e-9)
        assertEquals(0.0099089443, d[3]!!, 1e-9)
        assertEquals(0.0004287524, d[4]!!, 1e-9)
        assertEquals(0.0000064717, d[5]!!, 1e-9)
        assertEquals(0.0000000200, d[6]!!, 1e-9)
        assertEquals(1.0, d.values.sum(), 1e-12)
    }

    /**
     * Critério 2 — "backtest com n grande NÃO rejeita H0 (α = 5%)".
     *
     * O teste mais importante do projeto: sobre sorteios sabidamente
     * aleatórios, o laboratório precisa dizer "não refuta a aleatoriedade".
     * Se falhasse, o app produziria falsos positivos — anunciaria padrão onde
     * não há.
     */
    @Test
    fun `n grande nao rejeita a hipotese nula`() = runTest {
        val repo = historicoAleatorio(Lottery.MEGA_SENA, concursos = 1500, semente = 20260903)
        val report = BacktestEngine(repo).run(
            BacktestConfig(
                lottery = Lottery.MEGA_SENA,
                cutoff = cutoff,
                gamesPerContest = GameGenerator.MIN_GAMES,
                seed = 777L,
                replications = 20,
            ),
        )
        assertEquals(1200, report.validationDraws)
        assertEquals(
            "Geração ponderada por desempenho sobre sorteios aleatórios não " +
                "pode acusar desvio. p=${report.hypothesisTest.meanTest.pValue}",
            Verdict.NAO_REFUTA_ALEATORIEDADE,
            report.verdict,
        )
        assertTrue(report.hypothesisTest.meanTest.pValue > 0.05)
        assertTrue(report.hypothesisTest.meanTest.confidenceInterval.contains(0.600))
    }

    /**
     * Critério 3 — segunda passada independente (histórico e semente
     * diferentes) do mesmo critério acima: dezenas "quentes" no histórico de
     * treino não produzem vantagem detectável na validação.
     */
    @Test
    fun `dezenas quentes no treino nao superam o acaso sobre historico longo`() = runTest {
        val repo = historicoAleatorio(Lottery.MEGA_SENA, concursos = 1500, semente = 424242)
        val report = BacktestEngine(repo).run(
            BacktestConfig(
                lottery = Lottery.MEGA_SENA,
                cutoff = cutoff,
                gamesPerContest = GameGenerator.MIN_GAMES,
                seed = 31337L,
                replications = 20,
            ),
        )
        assertEquals(
            "Dezenas ‘quentes’ não podem render desvio significativo. " +
                "média=${report.stats.mean} p=${report.hypothesisTest.meanTest.pValue}",
            Verdict.NAO_REFUTA_ALEATORIEDADE,
            report.verdict,
        )
        assertEquals(0.600, report.monteCarlo.meanOfMeans, 0.06)
    }

    /**
     * Critério 4 — "fechamento por cobertura passa em verificação exaustiva do
     * pior caso". Coberto em detalhe por `ClosureDesignerTest`; aqui fica a
     * confirmação de que o catálogo inteiro está íntegro.
     */
    @Test
    fun `catalogo de fechamentos esta integro`() {
        com.volanteplus.loterias.domain.generator.ClosureGuarantee.values().forEach { garantia ->
            val catalogo = com.volanteplus.loterias.domain.generator.ClosureDesigner.catalog(garantia)
            assertTrue(catalogo.isNotEmpty())
            catalogo.forEach { design ->
                assertTrue(
                    "Garantia de ${garantia.label} falha no pool de ${design.poolSize}",
                    com.volanteplus.loterias.domain.generator.ClosureDesigner.verify(design),
                )
            }
        }
    }

    /**
     * O retorno esperado do relatório é o mesmo valor fixado em norma antes
     * do sorteio — coberto em detalhe por `PrizeTableTest`; aqui fica a
     * confirmação de que o `BacktestReport` o repassa sem alterar.
     */
    @Test
    fun `retorno esperado do relatorio bate com o valor fixado em norma`() = runTest {
        val repo = historicoAleatorio(Lottery.MEGA_SENA, concursos = 300, semente = 12345)
        val report = BacktestEngine(repo).run(
            BacktestConfig(
                lottery = Lottery.MEGA_SENA,
                cutoff = cutoff,
                seed = 1L,
                replications = 2,
            ),
        )
        assertEquals(2.601, report.expectedReturn.longRunReturn, 1e-9)
    }

    /**
     * As réplicas precisam de fato variar entre si — se não variassem, a
     * decomposição de variância estaria medindo zero por construção e o
     * número reportado seria decorativo.
     */
    @Test
    fun `replicas produzem resultados distintos e separam as fontes de variacao`() = runTest {
        val repo = historicoAleatorio(Lottery.MEGA_SENA, concursos = 500, semente = 2468)
        val report = BacktestEngine(repo).run(
            BacktestConfig(
                lottery = Lottery.MEGA_SENA,
                cutoff = cutoff,
                seed = 99L,
                replications = 40,
            ),
        )
        assertEquals(40, report.monteCarlo.replications)
        assertEquals(400, report.validationDraws)

        val medias = report.monteCarlo.replicationMeans
        assertTrue(
            "Réplicas idênticas indicam que a semente não está sendo derivada",
            medias.toSet().size > 1,
        )

        // Verificação quantitativa em vez de contagem de valores distintos: com
        // 400 concursos a média é sempre um inteiro sobre 400, e só algumas
        // dezenas de valores ocorrem na prática — empates entre réplicas são
        // esperados e não dizem nada. O que precisa bater é a dispersão.
        //
        // Desvio teórico entre réplicas = σ / √n = 0,7030201192 / √400 = 0,035151.
        val desvioEsperado = Hypergeometric.stdDeviationFor(Lottery.MEGA_SENA) / kotlin.math.sqrt(400.0)
        val desvioObservado = kotlin.math.sqrt(report.monteCarlo.decomposition.monteCarlo)
        assertEquals(
            "Dispersão entre réplicas fora do previsto pela teoria",
            desvioEsperado,
            desvioObservado,
            desvioEsperado * 0.5,
        )

        assertTrue(report.monteCarlo.decomposition.intrinsic > 0.0)
        assertTrue(report.monteCarlo.decomposition.monteCarlo > 0.0)
        assertTrue(report.monteCarlo.standardError > 0.0)
        assertTrue(report.monteCarlo.interval.contains(report.monteCarlo.meanOfMeans))

        // A variação do próprio sorteio domina o ruído do método — é exatamente
        // o que a decomposição existe para mostrar ao usuário.
        assertTrue(
            "Ruído do método (${report.monteCarlo.decomposition.monteCarlo}) deveria ser " +
                "pequeno perto da variação intrínseca (${report.monteCarlo.decomposition.intrinsic})",
            report.monteCarlo.decomposition.monteCarloFraction < 0.05,
        )
    }

    /** Mesma semente, mesmo resultado: o relatório precisa ser reproduzível. */
    @Test
    fun `backtest com semente e reproduzivel`() = runTest {
        val repo = historicoAleatorio(Lottery.MEGA_SENA, concursos = 200, semente = 555)
        fun cfg(seed: Long) = BacktestConfig(
            lottery = Lottery.MEGA_SENA,
            cutoff = cutoff,
            seed = seed,
            replications = 5,
        )
        val a = BacktestEngine(repo).run(cfg(2026L))
        val b = BacktestEngine(repo).run(cfg(2026L))
        val c = BacktestEngine(repo).run(cfg(2027L))
        assertEquals(a.monteCarlo.replicationMeans, b.monteCarlo.replicationMeans)
        assertNotEquals(a.monteCarlo.replicationMeans, c.monteCarlo.replicationMeans)
    }
}
