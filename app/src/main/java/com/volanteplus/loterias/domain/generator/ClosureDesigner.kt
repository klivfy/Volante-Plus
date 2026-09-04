package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.backtest.PrizeTable
import com.volanteplus.loterias.domain.model.GeneratedGame

/**
 * Garantia que um fechamento oferece.
 *
 * A promessa é **condicional** e é assim que deve ser lida: *se* [hits] das
 * dezenas que você marcou saírem no sorteio, *então* pelo menos um jogo do
 * desdobramento contém essas [hits] dezenas. Não há promessa alguma sobre
 * as dezenas saírem.
 */
enum class ClosureGuarantee(val hits: Int, val label: String) {
    TERNO(3, "terno"),
    QUADRA(4, "quadra"),
}

/**
 * Desdobramento de um fechamento: quais jogos apostar para que a garantia
 * valha em **todos** os casos possíveis, não só na maioria.
 */
data class ClosureDesign(
    val poolSize: Int,
    val guarantee: ClosureGuarantee,
    /** Jogos como índices 0-based dentro do pool, já ordenados. */
    val games: List<List<Int>>,
) {
    val gameCount: Int get() = games.size

    /** Custo total do desdobramento, em reais. */
    val totalCost: Double get() = gameCount * PrizeTable.SIMPLE_BET_PRICE

    /**
     * O contrato em uma frase, do jeito que deve aparecer para quem aposta:
     * quantos jogos, qual a condição e quanto custa.
     */
    val contract: String
        get() = "$gameCount jogos, R$ %.2f: %s garantida se %d das suas %d dezenas saírem"
            .format(totalCost, guarantee.label, guarantee.hits, poolSize)

    /** Traduz os índices para as dezenas efetivamente marcadas no volante. */
    fun apply(pool: List<Int>): List<GeneratedGame> {
        require(pool.size == poolSize) {
            "Fechamento desenhado para $poolSize dezenas, recebidas ${pool.size}"
        }
        require(pool.toSet().size == pool.size) { "Dezenas repetidas no fechamento" }
        val sorted = pool.sorted()
        return games.map { game -> GeneratedGame(numbers = game.map(sorted::get).sorted()) }
    }
}

/**
 * Fechamentos por **covering design** — a única forma de dar uma garantia
 * verdadeira sobre um desdobramento.
 *
 * ## O problema com a regra de repetição mínima
 * O [GameGenerator] espalha as dezenas do pool entre os jogos sem repetir
 * enquanto houver inéditas. Isso parece um fechamento, mas não garante nada:
 * em 300 simulações com pool de 10 dezenas, **as 300** deixaram algum
 * conjunto de 4 dezenas do pool sem estar contido em nenhum jogo. Ou seja, o
 * apostador podia acertar 4 das suas 10 dezenas e mesmo assim não ter quadra
 * em jogo nenhum. A promessa implícita era falsa.
 *
 * ## O que é um covering design
 * Um C(v, k, t) é uma coleção de blocos de tamanho k, tirados de v elementos,
 * tal que **todo** subconjunto de tamanho t está contido em pelo menos um
 * bloco. Aqui: v = dezenas marcadas, k = 6 (jogo simples), t = acertos que
 * dispararam a garantia. Se todo t-subconjunto está coberto, a garantia vale
 * no pior caso — não em média.
 *
 * ## Verificação
 * Cada desdobramento aqui foi verificado **exaustivamente**: todos os C(v, t)
 * subconjuntos foram testados um a um. [verify] refaz essa verificação em
 * tempo de execução e é exercida nos testes; nenhuma garantia deste arquivo
 * é aceita por confiança na fonte.
 *
 * ## O que isto continua não fazendo
 * Fechamento **não aumenta a chance por real apostado**. Ele concentra o
 * risco: troca muitos resultados zerados por prêmios menores e mais
 * frequentes, ao custo de apostar mais. O retorno esperado por aposta
 * permanece exatamente o de [PrizeTable.expectedReturn] — negativo e
 * inalterado.
 */
object ClosureDesigner {

    /** Menor e maior pool suportado. */
    val SUPPORTED_POOL_SIZES: IntRange = 7..15

    /** Desdobramento para [poolSize] dezenas com a garantia pedida, ou null. */
    fun design(poolSize: Int, guarantee: ClosureGuarantee): ClosureDesign? {
        val table = when (guarantee) {
            ClosureGuarantee.QUADRA -> QUADRA_COVERINGS
            ClosureGuarantee.TERNO -> TERNO_COVERINGS
        }
        val encoded = table[poolSize] ?: return null
        return ClosureDesign(poolSize, guarantee, decode(encoded))
    }

    /** Todos os desdobramentos disponíveis, para a tela de fechamento. */
    fun catalog(guarantee: ClosureGuarantee): List<ClosureDesign> =
        SUPPORTED_POOL_SIZES.mapNotNull { design(it, guarantee) }

    /**
     * Verificação exaustiva do pior caso: percorre **todos** os
     * C(poolSize, t) subconjuntos e confirma que cada um está contido em
     * algum jogo. Retorna null se a garantia vale, ou o primeiro
     * contraexemplo encontrado.
     */
    fun findUncovered(design: ClosureDesign): List<Int>? {
        val blocks = design.games.map { game -> game.fold(0L) { acc, i -> acc or (1L shl i) } }
        var counterexample: List<Int>? = null
        forEachSubset(design.poolSize, design.guarantee.hits) { subset, mask ->
            if (blocks.none { (mask and it.inv()) == 0L }) {
                counterexample = subset.toList()
                false
            } else {
                true
            }
        }
        return counterexample
    }

    /** true quando a garantia se sustenta em todos os casos possíveis. */
    fun verify(design: ClosureDesign): Boolean = findUncovered(design) == null

    /**
     * Itera todos os [t]-subconjuntos de `0 until v`, entregando os índices e
     * a máscara de bits. Retornar false no callback interrompe a varredura.
     */
    private inline fun forEachSubset(v: Int, t: Int, action: (IntArray, Long) -> Boolean) {
        if (t > v) return
        val idx = IntArray(t) { it }
        while (true) {
            var mask = 0L
            for (i in idx) mask = mask or (1L shl i)
            if (!action(idx, mask)) return
            var pos = t - 1
            while (pos >= 0 && idx[pos] == v - t + pos) pos--
            if (pos < 0) return
            idx[pos]++
            for (j in pos + 1 until t) idx[j] = idx[j - 1] + 1
        }
    }

    /** Blocos como grupos de 6 dígitos hexadecimais, separados por espaço. */
    private fun decode(encoded: String): List<List<Int>> =
        encoded.split(' ').map { block -> block.map { it.digitToInt(16) }.sorted() }

    // ------------------------------------------------------------------
    // Coberturas C(v, 6, 4) — garantia de quadra.
    // Cada uma verificada exaustivamente sobre os C(v,4) quartetos.
    // ------------------------------------------------------------------
    private val QUADRA_COVERINGS: Map<Int, String> = mapOf(
        7 to
            "013456 012356 012346 012345 023456",
        8 to
            "014567 023467 123457 013456 012367 023567 012456",
        9 to
            "012346 034578 125678 023567 134678 012458 024678 123457 013568 234568 014567 012378",
        10 to
            "013679 012356 023678 245789 126789 024689 015689 234567 123478 012459 012578 023479 045678 013468 235689 123469 035789 145679 134589 013457",
        11 to
            "023469 03567a 012678 02467a 02389a 24579a 23678a 124589 023579 346789 123456 01789a 45678a 12457a 01348a 12569a 256789 23478a 01245a 12358a 034578 014678 14569a 024568 013479 04589a 01689a 135789 34569a 13679a 013568 012379 015679",
        12 to
            "02579b 1239ab 012348 156789 0356ab 3478ab 01457a 01469b 24679a 24568b 023689 123567 1268ab 01358b 34579b 02378a 13467b 124789 13789a 1245ab 0127ab 02678b 01369a 13459a 02347b 5679ab 012569 023459 02346a 345689 14568a 045678 01789b 23578a 23689b 0489ab 03679a 02589a 01678a 15789b 13689a 23459b 0456ab 01357b 1258ab 14568b 24578a 236789 03479b 12456a",
        13 to
            "1279bc 23456c 12458b 014679 013589 0256ab 0357ac 02489a 389abc 13567b 0459bc 2678ac 12347a 0178ab 146abc 03468b 34569a 01568c 235789 1259ac 13478c 02369c 0247bc 12689b 4578ab 5679bc 01239b 12368a 0134ac 012457 03679a 46789c 2358bc 23479b 025678 15789a 0159ab 13459c 0789bc 0458ac 2467ab 14568a 12367c 023abc 023478 12489c 05689b 479abc 3678bc 0169ac 2369ab 02579b 23458a 0167bc 03456b 1349ab 124569 1567ac 1348bc 0128ac 45789c 01347b 1278ab 4689ab 0246ac 013469 0257ac 135abc 345678 0368ac 234689 012356 0347ab 01248b 12379a 3579bc 2679bc 13678a",
        14 to
            "1236ab 124bcd 289abc 02569c 1459ab 0237cd 1369cd 1357bc 12358d 2345ac 234689 015acd 01789b 4578bd 04679d 0468bc 1467ac 0389ad 01248a 1279ad 0356bd 0347ab 268acd 01349c 35679a 012457 45789c 2567ab 79abcd 0259bd 13478d 168abd 3678bc 23479b 012367 12456d 15689b 069abc 02358b 1389ac 0178cd 0246ad 3459cd 34568a 26789d 02459a 2478ac 567acd 0134bd 0126bc 12579c 58abcd 4569bc 035789 012689 03458c 1489bd 34abcd 01356a 2357ad 2468bd 14568c 12578a 14679b 1239bc 027abd 0489cd 23467c 5689ad 4789ad 2369bd 0238ac 067bcd 13579d 1258bc 1378ab 01368d 0479ac 1346ad 02345b 0158ab 2359ab 03469b 2479cd 045678 0457ad 023789 0356bc 1567bd 127abc 01469a 3489ab 3679ac 01258d 123459 01579b 245689 2378bd 2469ab 3468cd 5689ac 34567d 0247bc 23456d 01678a 0257cd 0189bd",
        15 to
            "02358b 0378ac 236cde 2379ae 025acd 0136bd 15789a 345bde 1478ce 09abce 03469e 12467d 17abde 01249c 34567c 3589ce 134abc 189bcd 2468ae 02789d 1257bc 05679b 1356ae 3689ad 0148ad 249abd 5678de 0159de 34789b 02457e 0468bc 1269be 145689 267abc 2458cd 13679c 01238e 479acd 03459a 12359d 4578ab 037cde 2569ac 01267a 278bce 0156ce 0237bc 024bde 12acde 13578d 01479b 238abd 46bcde 058abe 12368c 3678be 0456ad 23456b 4679ae 359bcd 348ade 12347a 1349de 0689cd 156abd 2459ce 01678e 0139ab 0578bd 1245ae 279bcd 01345c 25678a 023489 0158bc 57acde 689bde 2367ad 1289ab 1357be 189ace 036abe 2579de 03479d 0246ac 1248bd 02689a 02356d 6789ce 358acd 0167cd 047abe 02589b 4569bc 13468a 0289ce 235abe 03579c 146bce 12679d 3489ac 3569be 45689d 368abc 079abd 234ace 0157ac 026ade 1345cd 0478cd 14678b 12568e 03458e 2568bd 2478bc 03568c 0179be 1278de 014567 12389b 159abc 169ade 23578c 347bde 01245b 1489be 0123ad 23469d 46abcd 038cde 034bce 01689d 456ace 24579d 59acde 0149ae 0269ab 01367e 78abde 3578ab 056bcd 1268ac 135bce 267bde 239ace",
    )

    // ------------------------------------------------------------------
    // Coberturas C(v, 6, 3) — garantia de terno.
    // ------------------------------------------------------------------
    private val TERNO_COVERINGS: Map<Int, String> = mapOf(
        7 to
            "012356 012346 023456 012345",
        8 to
            "013567 123456 023457 012467",
        9 to
            "023468 012578 124578 023456 135678 013467 012367",
        10 to
            "046789 234569 134579 023689 023478 015789 012568 123679 013458 124567",
        11 to
            "023678 145678 01689a 24789a 013479 03458a 12346a 01257a 123589 35679a 024569",
        12 to
            "02379a 23458b 12579b 1347ab 013589 1589ab 35678a 014579 03469b 01678b 14569a 0256ab 246789 01248a 12368a",
        13 to
            "0124bc 02689a 35678c 045679 346abc 01256a 124678 0167ab 12357c 01369c 01358b 4589ab 059abc 12379b 257abc 23467a 25689b 03489a 1789ac 24569c 13459a 02378c 1478bc",
        14 to
            "0169ab 14679c 02467c 016789 2379bd 0157bd 1368cd 0389ac 126abc 02458b 02579a 2468ad 1356ab 358abc 0689cd 012349 12378a 47abcd 04567a 5678bd 23569c 1459ad 03467b 0125cd 14589b 34578c 0345ad 0289bc",
        15 to
            "0268ce 3468ad 135789 279abe 36bcde 3467bc 2357ac 03459e 2469cd 0146cd 0379ab 056789 1234ae 017bce 01259c 01247a 5689bc 378acd 4789ce 04578d 3578be 01236b 02458b 0369ac 04abde 278abd 0168ac 1356cd 02389d 1679de 1489ab 2456ae 267abc 159abd 1258de 458ace 01345a",
    )
}
