# Contrato: histórico de rateio embutido (`web/src/data/rateio/`)

Gerado por `web/scripts/update-rateio-seed.mjs`. **Não editar à mão.** Mesmo
padrão de `web/src/data/history/` (feature anterior), carregado sob demanda.

## Arquivos

- `megasena.json`, `maismilionaria.json`: uma tupla por concurso.
- `meta.json`: `{ generatedAt, source, officialCrossCheck: { sampled, mismatches }, preregistrationCommit, lotteries: { <lottery>: { count, firstContest, lastContest, firstContestWithCollection } } }`.

## Tupla

```
[concurso, "yyyy-mm-dd", arrecadacao | null, [ganhadores por faixa], [premio por faixa], [ordem de extração], "local", especial | 0]
```

- `arrecadacao`: `null` quando a fonte traz 0 ou ausente (Mega-Sena antiga).
- `ganhadores` e `premio`: na ordem das faixas de `official-rules.json` (3 na
  Mega, 10 na +Milionária).
- `ordem de extração`: dezenas na ordem em que saíram; na +Milionária, seguidas
  dos 2 trevos (formato observado na API oficial; confirmar na fase 2).
- `local`: normalizado por tabela pré-registrada (ex.: `ESPAÇO DA SORTE` →
  `espaco-da-sorte`).
- `especial`: 0 para concurso comum; código da regra especial quando houver.

## Regras de validação (o script ABORTA sem gravar se qualquer uma falhar)

1. Contíguo do concurso 1 ao último, sem duplicatas, e com os mesmos números
   de concurso e datas de `web/src/data/history/`.
2. A ordem de extração é uma permutação das dezenas sorteadas do histórico de
   dezenas (e dos trevos, na +Milionária).
3. Ganhadores inteiros ≥ 0; prêmios ≥ 0; prêmio > 0 implica ganhadores > 0.
4. Nas faixas de valor fixo da +Milionária, o prêmio é exatamente o valor da
   regra (50, 24, 12, 6) em todo concurso — checagem de sanidade da fonte.
5. Conferência por amostragem contra a API oficial da Caixa (no mínimo 50
   concursos por modalidade, sorteados com semente fixa): qualquer
   divergência aborta e é relatada.
6. **Guarda de pré-registro**: o script recusa rodar se
   `web/src/engine/popularity/preregistration.ts`, `web/src/engine/demandModel.ts`
   (bloco de pré-registro) ou `web/src/engine/audit/preregistration.ts`
   tiverem alterações não commitadas, e grava o hash do commit em
   `meta.json.preregistrationCommit`.

## Procedência

`third_party_mirror` (mesma API do histórico de dezenas), com a conferência
oficial registrada em `meta.json`. Concursos com `arrecadacao = null` são
excluídos de calibração de popularidade e de demanda, e a contagem de
exclusões aparece no relatório (Princípio IV).
