# Histórico real embutido

`megasena.json` e `maismilionaria.json` — todos os concursos desde o 1º, em
tuplas `[concurso, "yyyy-mm-dd", [dezenas], [trevos]?]`. `meta.json` diz até qual
concurso vão. Gerados e validados por `scripts/update-history-seed.mjs`; ver
`docs/historico.md`. **Não edite à mão.** Acesse via `loadHistorySeed` (`index.ts`).
