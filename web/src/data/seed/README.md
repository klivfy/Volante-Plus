# Seed data offline (fallback)

`megasena.json` e `mais_milionaria.json` — 50 concursos cada, no formato
`Draw[]` de `src/types/domain.ts`.

**Estes dados são sintéticos, gerados por PRNG determinístico (seed fixa,
ver o script usado em `gen_seed.mjs`, não commitado), não resultados reais
da Caixa.** Servem só de fallback para o app ter algum histórico para
analisar/gerar antes da primeira sincronização de verdade com a API da
Caixa (`services/caixaApi.ts`) — números, prêmios e datas aqui não devem
ser usados para nenhuma decisão real. Isso segue a mesma regra já aplicada
ao seed do Android (`app/src/main/assets/seed/README.md`), que também
distingue explicitamente dado real de dado de desenvolvimento — a
diferença é que ali dado fictício é proibido (o seed do Android é
alimentado só por exportação oficial), enquanto aqui ele existe de
propósito como fallback offline-first.

Todas as dezenas respeitam as regras de negócio de cada loteria (Mega-Sena:
6 dezenas 1–60; +Milionária: 6 dezenas 1–50 + 2 trevos 1–6), e as datas
terminam antes da data de geração deste seed — não há concurso "no
futuro".

Acesse via `getSeedData(lottery)` (`index.ts`), nunca importe os `.json`
diretamente fora deste módulo.
