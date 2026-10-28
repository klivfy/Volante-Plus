# Histórico real embutido

`megasena.json`, `maismilionaria.json` e `quina.json` — todos os concursos
desde o 1º, em tuplas `[concurso, "yyyy-mm-dd", [dezenas], [trevos]?]`.
`meta.json` diz até qual concurso vão (e quantos foram conferidos contra
fonte independente). Gerados e validados por `scripts/update-history-seed.mjs`;
ver `docs/historico.md`. **Não edite à mão.** Acesse via `loadHistorySeed`
(`index.ts`).
