package com.volanteplus.loterias.domain.generator

import com.volanteplus.loterias.domain.model.Lottery
import kotlin.math.abs

/**
 * Medida de quão **popular** é um jogo entre outros apostadores.
 *
 * ## Por que isto não é previsão
 * Loteria brasileira é pari-mutuel: o prêmio de cada faixa é um bolo dividido
 * entre quem acertou. A chance de acertar não depende das dezenas escolhidas
 * — isso é o teorema da invariância, e continua valendo aqui. Mas **quanto
 * você receberia se acertasse** depende de com quantas pessoas você divide.
 *
 * Então esta pontuação não mexe na probabilidade de ganhar. Ela mexe no valor
 * esperado *condicional a ganhar*. É a única alavanca real que sobra, e ela é
 * pequena: o retorno esperado incondicional continua exatamente o mesmo,
 * negativo e fixado em norma.
 *
 * ## O que a literatura mostra
 * Jogadores não escolhem ao acaso — o fenômeno se chama *conscious selection*.
 * Os vieses medidos que esta pontuação penaliza:
 *
 * - **Datas de aniversário.** Em 5.078.901 combinações reais do Dutch Lotto
 *   (2010-2012), o dia do nascimento foi escolhido em 21,03% dos casos
 *   contra 13,33% esperados sob escolha aleatória (p < 0,001); o mês, em
 *   17,94%. Isso concentra as apostas em dezenas ≤ 31, e mais ainda em ≤ 12.
 *   Wang, T. V., Potter van Loon, R. J. D., van den Assem, M. J. e van
 *   Dolder, D., *Number preferences in lotteries*, Judgment and Decision
 *   Making 11(3), 2016.
 *   https://www.cambridge.org/core/journals/judgment-and-decision-making/article/number-preferences-in-lotteries/47BA27051627CEED421AD3AEE255521E
 * - **Centro do volante.** O mesmo estudo encontra que números no centro da
 *   cartela de escolha são de 5% a 13% mais escolhidos que números nas
 *   bordas, efeito robusto a várias definições de "centro" testadas.
 * - **Primos e o número 7.** Primos são mais populares que não primos; o
 *   coeficiente do 7 é altamente significativo (0,0022 a 0,0027) em todos os
 *   modelos de proporção de vencedores, no Lotto e no Euromillions.
 *   Roger, P. e Roger, T., *On the preference for prime numbers: the case of
 *   lotto players*, 2024 — 10 anos de dados da loteria nacional belga
 *   (1.044 sorteios do Lotto, 758 do Euromillions, ~600 mil apostadores por
 *   sorteio em cada). Coeficiente de "# números primos" na proporção de
 *   vencedores: 0,0003 a 0,0011 (p < 1%) conforme o modelo e o jogo — a
 *   direção do efeito é a que esta pontuação usa, mas a magnitude é pequena.
 *   https://hal.science/hal-04451846v2/document
 * - **Sequências consecutivas.** Há relato de sorteio com sequência longa que
 *   produziu número anômalo de acertadores na segunda faixa. Este é o viés
 *   com evidência mais fraca dos quatro, e por isso recebe o menor peso.
 *
 * ## Honestidade sobre os pesos
 * Os pesos abaixo são **heurísticos**, não estimados a partir de dados de
 * apostas brasileiras — a Caixa não publica a distribuição de dezenas
 * apostadas, então não há como calibrá-los. Eles codificam a direção do
 * efeito, que a literatura sustenta, não a sua magnitude no Brasil.
 */
object Unpopularity {

    /** Dezenas até 31 podem ser dia do mês. */
    const val BIRTHDAY_MAX = 31

    /** Dezenas até 12 podem ser mês, e sofrem o viés mais forte. */
    const val MONTH_MAX = 12

    /** Colunas do volante impresso da Caixa. */
    const val VOLANTE_COLUMNS = 10

    // Pesos heurísticos. Ordem de grandeza reflete a força da evidência.
    private const val W_BIRTHDAY = 1.0
    private const val W_MONTH = 0.8
    private const val W_PRIME = 0.35
    private const val W_SEVEN = 0.30
    private const val W_CONSECUTIVE = 0.25
    private const val W_ALIGNMENT = 0.40
    private const val W_CENTER = 0.30
    private const val W_ARITHMETIC = 0.20

    /**
     * Recência: dezenas do concurso anterior são **menos** apostadas — a
     * falácia do apostador faz o jogador evitá-las ("acabou de sair, agora
     * vai demorar"). Clotfelter e Cook, *The "Gambler's Fallacy" in Lottery
     * Play*, Management Science 39(12), 1993: queda medida nas apostas sobre
     * dezenas recém-sorteadas. Incluí-las é de graça: mesma chance, menos
     * divisores. Peso conservador — a magnitude brasileira não é calibrada
     * (como os demais componentes).
     */
    private const val W_RECENCY = 0.25

    /**
     * Penalidade de popularidade do jogo. Maior = mais popular = pior para
     * o rateio. Sempre >= 0.
     *
     * @param recentNumbers dezenas do concurso mais recente (opcional): entram
     *   com sinal **negativo**, porque recém-sorteadas são menos apostadas.
     */
    fun penalty(
        lottery: Lottery,
        numbers: List<Int>,
        recentNumbers: Collection<Int> = emptySet(),
    ): Double {
        if (numbers.isEmpty()) return 0.0
        val n = numbers.size.toDouble()
        val sorted = numbers.sorted()

        val birthday = numbers.count { it <= BIRTHDAY_MAX } / n
        val month = numbers.count { it <= MONTH_MAX } / n
        val primes = numbers.count(::isPrime) / n
        val seven = if (7 in numbers) 1.0 else 0.0
        val recency = numbers.count { it in recentNumbers } / n

        // Pares consecutivos: 5, 6 conta uma vez.
        val consecutive = sorted.zipWithNext().count { (a, b) -> b - a == 1 } / (n - 1).coerceAtLeast(1.0)

        // Alinhamento no volante: dezenas na mesma coluna ou na mesma linha
        // formam o desenho vertical/horizontal que as pessoas marcam.
        val columns = numbers.groupingBy { (it - 1) % VOLANTE_COLUMNS }.eachCount()
        val rows = numbers.groupingBy { (it - 1) / VOLANTE_COLUMNS }.eachCount()
        val alignment = (maxRepeat(columns) + maxRepeat(rows) - 2.0) / (2 * (n - 1)).coerceAtLeast(1.0)

        // Atração pelo centro do volante, medida como proximidade média do meio.
        val universe = lottery.numberRange
        val middle = (universe.first + universe.last) / 2.0
        val halfSpan = (universe.last - universe.first) / 2.0
        val center = if (halfSpan <= 0.0) {
            0.0
        } else {
            numbers.map { 1.0 - abs(it - middle) / halfSpan }.average()
        }

        // Progressão aritmética exata (5,10,15,...) é padrão deliberado comum.
        val arithmetic = if (numbers.size >= 3 && isArithmetic(sorted)) 1.0 else 0.0

        return (W_BIRTHDAY * birthday +
            W_MONTH * month +
            W_PRIME * primes +
            W_SEVEN * seven +
            W_CONSECUTIVE * consecutive +
            W_ALIGNMENT * alignment.coerceIn(0.0, 1.0) +
            W_CENTER * center +
            W_ARITHMETIC * arithmetic -
            W_RECENCY * recency).coerceAtLeast(0.0)
    }

    private fun maxRepeat(counts: Map<Int, Int>): Double =
        (counts.values.maxOrNull() ?: 1).toDouble()

    private fun isArithmetic(sorted: List<Int>): Boolean {
        val step = sorted[1] - sorted[0]
        return step != 0 && sorted.zipWithNext().all { (a, b) -> b - a == step }
    }

    /** Primalidade por divisão sucessiva; o universo aqui vai só até 60. */
    fun isPrime(value: Int): Boolean {
        if (value < 2) return false
        if (value < 4) return true
        if (value % 2 == 0) return false
        var d = 3
        while (d * d <= value) {
            if (value % d == 0) return false
            d += 2
        }
        return true
    }
}
