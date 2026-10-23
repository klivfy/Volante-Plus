# Data Model: Modalidade Quina

Nenhuma tabela, índice ou migração nova: a Quina é um valor novo do campo
`lottery` em estruturas que já o têm (Room `DrawEntity`, chave
`(lottery, contestNumber)`; Dexie `[lottery+contestNumber]`).

## Modalidade Quina (configuração, não dado persistido)

| Campo | Valor | Observação |
|---|---|---|
| identificador | `QUINA` (Kotlin) / `'quina'` (TypeScript, API e seed) | Kotlin: **declarar por último** no enum — a UI usa `ordinal` como índice de aba |
| nome de exibição | "Quina" | |
| universo de dezenas | 1–80 | |
| dezenas sorteadas (K) | 5 | hoje 6 fixo em `Draw.NUMBERS_DRAWN` |
| dezenas por aposta simples (n) | 5 | |
| seleção no volante | mínimo 5, máximo 15 | regra oficial (Decisão 4) |
| trevos | nenhum | `hasTrevos = false` |
| preço da aposta simples | R$ 3,00 | por modalidade (Decisão 3) |
| fração de prêmio bruto | 43,79% da arrecadação | por modalidade |
| faixas | 4: quina (5), quadra (4), terno (3), duque (2) | ver `contracts/quina-official-rules.md` |
| piso da data de corte | 1994-03-13 | primeiro concurso |
| histórico mínimo para backtest | 80 concursos | `5·N/K` com N = 80, K = 5 |

## Concurso da Quina

| Campo | Regra de validação |
|---|---|
| `contestNumber` | inteiro > 0; sequência contígua de 1 ao último |
| `date` | ISO-8601 (`yyyy-mm-dd`); no seed é a data real do sorteio |
| `numbers` | exatamente **5** valores distintos em 1..80, guardados em ordem crescente |
| `trevos` | ausente/vazio; qualquer trevo é rejeitado |

Invariante global do domínio (já existente, agora por modalidade):
`Draw` rejeita `numbers.size != lottery.numbersDrawn`. Concurso especial
(Quina de São João) tem a mesma forma e **não** é distinguido no modelo.

## Formatos de seed (derivados de uma única fonte)

Fonte única: `web/src/data/history/quina.json`, tuplas
`[contestNumber, "yyyy-mm-dd", [d1..d5]]` (3 elementos; sem quarto elemento
de trevos), ordenadas por concurso.

| Artefato | Formato | Gerado por |
|---|---|---|
| `web/src/data/history/quina.json` | tuplas acima | `web/scripts/update-history-seed.mjs` |
| `web/src/data/history/meta.json` → `lotteries.quina` | `{count, firstContest, lastContest, lastDate, crossChecked}` | mesmo script |
| `web/src/data/mirrorSnapshot/quina.json` | `[{contestNumber, date, numbers}]` coletado do portal da Caixa | mesmo script (modo coleta) |
| `app/src/main/assets/seed/quina.csv` | `# concurso;data;dezenas;trevos`, dezenas separadas por espaço, coluna de trevos vazia | `scripts/generate-android-seed.mjs` |
| `web/src/engine/closureTables.ts` e tabela Kotlin | blocos C(v,5,t), v = 6..15, t = 3 e 4 | `scripts/generate-closure-tables.mjs` |

Estado inicial esperado (2026-10-22): `count = lastContest = 7149`,
`firstContest = 1`, `lastDate = 2026-10-22`, 9 concursos especiais já
incluídos como comuns.

## Relatório de backtesting da Quina

Mesma estrutura dos demais (eficácia, variância, desvio padrão, comparação
com o baseline hipergeométrico): muda só a **distribuição de acertos**, que
vai de 0 a 5 (a tela hoje mostra linhas 0..6 e a linha "6" ficaria sempre
zerada), e a probabilidade esperada por faixa, que sai de `K = 5, N = 80,
n = 5`.

## Transições de estado

Nenhuma nova. A sincronização incremental e a aplicação do seed seguem as
regras existentes: o seed só preenche o que falta e nunca sobrescreve um
concurso já sincronizado; a versão do seed web (`historySeedVersion`) passa a
incluir o último concurso da Quina, de modo que a Quina é semeada uma vez em
quem já tinha o app.
