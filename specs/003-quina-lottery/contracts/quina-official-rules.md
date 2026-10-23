# Contrato: regras oficiais da Quina (oráculo verificável)

Fonte: Portal Loterias da Caixa, página da Quina (lida em 2026-10-23). Estes
valores são o **oráculo de teste**; em divergência com o regulamento oficial
vigente na hora de implementar, prevalece o regulamento (spec, Assumptions)
e este arquivo é corrigido na mesma mudança.

## Regras

- 5 dezenas sorteadas de 01 a 80; aposta de 5 a 15 dezenas; sem trevo.
- Prêmios: **quina** (5 acertos), **quadra** (4), **terno** (3), **duque** (2).
- Preço da aposta simples (5 dezenas): **R$ 3,00**. Preço de n dezenas =
  `C(n,5) × 3,00` (15 dezenas: 3.003 × 3 = **R$ 9.009,00**).
- Prêmio bruto: **43,79%** da arrecadação, rateado **35%** quina, **15%**
  quadra, **10%** terno, **10%** duque; os 30% restantes acumulam (final 5 e
  Quina de São João) e **não** entram nas faixas do concurso comum.
- Sorteios seis vezes por semana. Quina de São João (em torno de 24 de
  junho) e outros especiais têm a mesma forma de sorteio.

## Verificação 1 — chances exatas (aposta simples de 5 dezenas)

Total de apostas possíveis: `C(80,5) = 24.040.016`.

| Faixa | Contagem de combinações | Chance exata | Oficial (1 em) |
|---|---|---|---|
| quina (5) | 1 | 1 / 24.040.016 | 24.040.016 |
| quadra (4) | C(5,4)·C(75,1) = 375 | 375 / 24.040.016 | 64.106 |
| terno (3) | C(5,3)·C(75,2) = 27.750 | 27.750 / 24.040.016 | 866 |
| duque (2) | C(5,2)·C(75,3) = 675.250 | 675.250 / 24.040.016 | 36 |

Regra de teste: o valor exato do código **coincide** com a coluna "Chance
exata". A tabela da Caixa arredonda de forma inconsistente (ex.: 9,76 aparece
como 9, mas 11,68 como 12), então a comparação com a coluna "Oficial" exige
`|1/chance − oficial| ≤ 1` — e o valor exato é a referência (Decisão 8).

## Verificação 2 — tabela oficial por quantidade apostada

A "chance de uma faixa" na tabela da Caixa é a probabilidade de a aposta
conter **exatamente** f das 5 dezenas sorteadas — `C(5,f)·C(75, n−f) / C(80, n)`
para uma aposta de n dezenas (não "pelo menos f"). Conferido em 2026-10-23: as
44 células (11 tamanhos × 4 faixas) ficam a menos de 1 do inverso exato.
Chance "1 em …" por faixa, conforme o portal:

| Dezenas | Preço (R$) | Quina | Quadra | Terno | Duque |
|---|---|---|---|---|---|
| 5 | 3,00 | 24.040.016 | 64.106 | 866 | 36 |
| 6 | 18,00 | 4.006.669 | 21.658 | 445 | 25 |
| 7 | 63,00 | 1.144.763 | 9.409 | 261 | 18 |
| 8 | 168,00 | 429.286 | 4.770 | 168 | 14 |
| 9 | 378,00 | 190.794 | 2.687 | 115 | 12 |
| 10 | 756,00 | 95.396 | 1.635 | 82 | 9 |
| 11 | 1.386,00 | 52.035 | 1.056 | 62 | 8 |
| 12 | 2.376,00 | 30.354 | 714 | 48 | 7 |
| 13 | 3.861,00 | 18.679 | 502 | 38 | 6 |
| 14 | 6.006,00 | 12.008 | 364 | 31 | 5,8 |
| 15 | 9.009,00 | 8.005 | 271 | 25 | 5,2 |

## Verificação 3 — quantidade de prêmios por aposta (acertando h das 5 sorteadas)

Uma aposta de n dezenas que contém exatamente h das 5 sorteadas recebe, por
faixa, `C(h, f) · C(n−h, 5−f)` prêmios da faixa de f acertos. Exemplos
oficiais para conferir a fórmula: n = 6, h = 5 → 1 quina + 5 quadras; n = 8,
h = 5 → 1 / 15 / 30 / 10 (quina/quadra/terno/duque); n = 15, h = 5 → 1 / 50 /
450 / 1.200; n = 15, h = 2 → 286 duques.

## Verificação 4 — retorno esperado

Para a aposta simples, retorno esperado por real = `0,4379 × Σ(fração da
faixa) ` (com as frações de pagamento do concurso comum), **menor que 1**.
Conferir por simulação Monte Carlo independente (Princípio III) e provar que
é estritamente negativo, como já se faz para as outras modalidades.
