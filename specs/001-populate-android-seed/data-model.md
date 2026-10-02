# Phase 1 Data Model: Seed Completo do Histórico Oficial no Android

Dados estáticos (nenhuma entidade tem estado/transição em runtime — o seed é
lido uma única vez, na primeira execução, por `AssetDrawSeeder.seedIfEmpty`).

## Concurso (linha do seed, por modalidade)

Um concurso oficial de uma modalidade, como já modelado por `Draw`
(`shared/`) e já aceito por `CsvDrawParser` — esta feature não introduz
campo novo, só popula os valores reais.

| Campo | Tipo | Regra de validação |
|---|---|---|
| `contestNumber` | inteiro positivo | Único dentro da modalidade; sequência de 1 até o último, sem lacuna. |
| `date` | data ISO-8601 (`yyyy-MM-dd`) | Deve parsear como data válida. |
| `numbers` | lista de inteiros | Exatamente a quantidade de dezenas da modalidade (6, nas duas hoje), todas distintas, dentro do universo da modalidade (1–60 Mega-Sena, 1–50 +Milionária). |
| `trevos` | lista de inteiros | Mega-Sena: sempre vazia. +Milionária: exatamente 2 valores distintos, dentro de 1–6. |

## Seed CSV (arquivo, por modalidade)

A unidade de entrega desta feature: um arquivo `app/src/main/assets/seed/{megasena,maismilionaria}.csv`.

| Campo | Tipo | Regra de validação |
|---|---|---|
| Linha de comentário/cabeçalho | texto, iniciado por `#` ou `concurso;...` | Ignorada pelo parser (contrato já existente, ver `contracts/csv-seed-format.md`). |
| Sequência de Concursos | lista ordenada por `contestNumber` crescente | Contígua de 1 até `lastContest`; nenhum `contestNumber` repetido ou faltando; cada linha válida segundo a tabela acima. |

**Invariante de geração** (liga este arquivo à fonte): `lastContest` e a
contagem total de linhas MUST bater exatamente com
`web/src/data/history/meta.json → lotteries.<modalidade>.{lastContest,count}`
no momento em que o arquivo foi gerado (Success Criteria SC-002 da spec).

## Histórico de referência (fonte, não gerada por esta feature)

`web/src/data/history/{megasena,maismilionaria}.json` + `meta.json` — já
existe, já validado por `web/scripts/update-history-seed.mjs` (ver
`docs/historico.md`). Esta feature só **lê** essa entidade; nunca a
modifica, nunca a reconstrói.

| Campo (por modalidade, em `meta.json`) | Uso nesta feature |
|---|---|
| `count` | Valor esperado de linhas no CSV gerado (invariante acima). |
| `firstContest` | Sempre 1 — confirma que a própria fonte é contígua desde o início. |
| `lastContest` | Valor esperado do último `contestNumber` no CSV gerado. |
| `lastDate` | Reportado no resumo que o script de geração imprime ao terminar (FR-005). |

Cada entrada de `<modalidade>.json` é a tupla
`[contestNumber, date, numbers[], trevos[]?]` (`trevos` ausente na
Mega-Sena) — ver `web/src/data/history/index.ts` para a forma exata já em
uso.

## Sem contratos de API, sem estado compartilhado

Esta feature não expõe nenhuma API nova nem introduz estado persistente
além dos dois arquivos CSV acima — o único "contrato" relevante é o formato
de arquivo, documentado em `contracts/csv-seed-format.md`.
