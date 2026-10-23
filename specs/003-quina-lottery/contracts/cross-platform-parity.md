# Contrato: o que Kotlin e TypeScript devem provar igual (Princípio V)

Cada item é um caso executado **nos dois lados** com os mesmos números.

1. Distribuição hipergeométrica `K=5, N=80, n=5` e `n∈{6..15}`: probabilidades
   por número de acertos (0..5) iguais até 1e-12 e iguais à combinatória exata.
2. Chance de cada faixa da Quina (4 faixas): `isPrize`, `tierIndex`,
   `tierCount` iguais (≥ 2 acertos paga; 5→1, 4→2, 3→3, 2→4).
3. Preço e custo: `C(n,5)·3,00` para n = 5..15 e custo total de um
   fechamento = `jogos × 3,00` (não × 6,00).
4. Fechamento k=5: para v = 6..15 e t ∈ {3,4}, número de jogos e verificação
   exaustiva de cobertura iguais (mesmo dado de origem das tabelas).
5. Lote com semente fixa: quando o gerador usa a mesma semente e estratégia, os
   jogos são válidos (5 dezenas distintas em 1–80) nos dois lados; a igualdade
   byte a byte só é exigida onde a implementação já é determinística e
   compartilhada hoje (mesmo critério das outras modalidades).
6. Regressão (SC-005): saída de Mega-Sena e +Milionária idêntica à captura
   dourada feita **antes** da refatoração.
7. Parser/seed: o mesmo conjunto de concursos (contagem, último, primeiros e
   últimos 3 concursos) em `quina.json`, `quina.csv` e no snapshot do portal.
