package com.volanteplus.loterias.domain.model

/** Estratégias de geração de jogos. */
enum class GenerationStrategy(
    val displayName: String,
    val description: String,
    /** Estratégias com histórico só rodam sob o protocolo de backtesting. */
    val requiresHistory: Boolean = false,
) {
    /** RNG criptográfico. Zero viés, zero filtro. */
    RANDOM("Aleatório puro", "RNG criptográfico. Zero viés, zero filtro."),

    /** Espalha pares/ímpares matematicamente (3 de cada por jogo). */
    BALANCED("Equilibrado", "Espalha pares/ímpares matematicamente."),

    /** "Números quentes": a promessa clássica que o backtesting coloca à prova. */
    FREQUENCY(
        "Mais sorteadas",
        "Prioriza as dezenas mais frequentes da janela de treino — hipótese a refutar.",
        requiresHistory = true,
    ),

    /**
     * Evita as dezenas que a literatura mostra serem mais apostadas.
     *
     * Não é previsão e não compete com as outras estratégias em acertos: pelo
     * teorema da invariância, tem exatamente a mesma esperança de acertos que
     * o aleatório puro. O que muda é o rateio — ver [GenerationStrategy.honestNote].
     */
    UNPOPULAR(
        "Menos apostadas",
        "Foge de aniversários, sequências e desenhos no volante — muda o rateio, não a chance.",
    ),
    ;

    /**
     * Ressalva que a interface deve exibir junto à estratégia. Existe para
     * que nenhuma tela possa apresentar uma estratégia sem o seu limite.
     */
    val honestNote: String
        get() = when (this) {
            RANDOM -> "É a hipótese nula do laboratório: nenhuma outra estratégia acerta mais que esta."
            BALANCED -> "Equilíbrio par/ímpar não altera a probabilidade de acerto. É estética."
            FREQUENCY -> "Sorteios não têm memória. Dezena ‘quente’ não tem chance maior de sair."
            UNPOPULAR ->
                "Não aumenta sua chance de ganhar; aumenta quanto você receberia se ganhasse, " +
                    "porque menos gente divide o prêmio com você."
        }
}

/**
 * Jogo gerado: [numbers] sempre ordenado; [trevoDuplas] vazio para loterias
 * sem trevos, 1 dupla no modo Econômico ou as 15 duplas na Cobertura total.
 */
data class GeneratedGame(
    val numbers: List<Int>,
    val trevoDuplas: List<Set<Int>> = emptyList(),
)

data class GameBatch(
    val lottery: Lottery,
    val strategy: GenerationStrategy,
    val games: List<GeneratedGame>,
    /** Dezenas de origem no modo Fechamento; null quando o lote usa o volante inteiro. */
    val sourcePool: List<Int>? = null,
)
