# Fixture sintética (NÃO é histórico real)

`megasena.json` e `mais_milionaria.json` — 50 concursos cada, gerados por PRNG
determinístico. **Não são resultados da Caixa.**

Até esta versão eram o "seed offline" do app, o que significava que um usuário
sem rede analisava sorteios inventados. O seed do app agora é o histórico real
completo (`../history/`). Esta pasta ficou só com dois usos:

1. `engine/audit/provenance.ts` recusa auditar dados que coincidam com esta
   fixture (defesa em profundidade contra auditar um PRNG por engano).
2. Testes que precisam de dado sintético reconhecível.

Acesse via `getSyntheticFixture(lottery)`. Nunca use como fonte de dados do app.
