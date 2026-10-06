# Contrato: artefatos de modelo (`web/src/data/models/`)

Gerados por `web/scripts/fit-popularity.mjs` e `web/scripts/fit-demand.mjs`.
Consumidos pelo motor web e, via `scripts/sync-shared-models.mjs`, pelo
Android. Um artefato sem os campos obrigatórios abaixo é recusado na carga, e
o app cai no comportamento de reserva declarado.

## Campos comuns (obrigatórios)

```jsonc
{
  "artifact": "popularity",            // ou "demand"
  "artifactVersion": "1.0.0",
  "preregistration": { "id": "popularity", "version": "1.0.0", "commit": "<sha>" },
  "data": {
    "source": "web/src/data/rateio (meta.generatedAt=…)",
    "provenance": "third_party_mirror",
    "fromContest": 0, "toContest": 0,
    "excluded": { "noCollection": 0, "special": 0 }
  },
  "controls": {                        // Princípio III — sem isto, recusado
    "simulations": 1000,
    "negativeAdoptionRate": 0.0,       // deve ser ≤ 0,05 (+ tolerância pré-registrada)
    "positiveAdoptionRate": 0.0        // deve ser ≥ 0,80
  },
  "decision": "…",
  "fittedAt": "…",
  "validUntil": "…"
}
```

## `popularity.json`

```jsonc
{
  "…comuns…": "…",
  "lotteries": {
    "megasena": {
      "numbers": {
        "features": ["le31", "le12", "prime", "is7", "mult5", "mult10", "row", "col", "centerDist"],
        "beta": [ /* um por feature */ ],
        "perNumber": [ /* 60 valores, soma zero */ ],
        "surpriseShare": 0.0
      },
      "dispersion": { "4": 0.0, "5": 0.0 },
      "eraEffects": { "<era>": 0.0 },
      "validation": {
        "metric": "nb-deviance-per-contest",
        "confirmation": { "uniform": 0.0, "heuristic": 0.0, "calibrated": 0.0, "pCalibratedVsHeuristic": 0.0, "pBestVsUniform": 0.0 },
        "prospective": { "contests": 0, "uniform": 0.0, "heuristic": 0.0, "calibrated": 0.0, "…": "…" }
      },
      "decision": "CALIBRATED_ADOPTED"   // | "HEURISTIC_KEPT" | "NO_SUPPORT"
    },
    "maismilionaria": {
      "numbers": { "…": "…" },
      "trevos": { "weights": [ /* 6 */ ], "surpriseShare": 0.0 },   // ou "undetectable"
      "…": "…"
    }
  }
}
```

Regras:

- A decisão é tomada **pelo script**, pela regra de research.md, R7; o arquivo
  não aceita decisão escrita à mão (o teste recalcula a decisão a partir das
  métricas gravadas e falha se divergir).
- `perNumber` soma zero (tolerância 1e-9); `surpriseShare` em [0, 1].
- `validUntil` = `fittedAt` + prazo pré-registrado; vencido, o app sinaliza
  (FR-013).

## `demand.json`

```jsonc
{
  "…comuns…": "…",
  "lotteries": {
    "megasena": {
      "coefficients": { "alphaByEra": {}, "betaLogPrize": 0.0, "gammaFinal05": 0.0, "deltaWeekday": {} },
      "validation": { "metric": "mape", "baseline": "lastCollection", "confirmation": { "model": 0.0, "baseline": 0.0, "p": 0.0 }, "prospective": { "…": "…" } },
      "decision": "MODEL_ADOPTED"        // | "BASELINE_KEPT"
    },
    "maismilionaria": { "…": "…" }
  }
}
```

## Guarda nos scripts

1. Recusa rodar com alteração não commitada no arquivo de pré-registro
   correspondente; grava `preregistration.commit` com o hash atual.
2. Recusa rodar se `web/src/data/rateio/meta.json.preregistrationCommit` for
   anterior ao commit do pré-registro em uso (rateio baixado antes do
   pré-registro).
3. Roda primeiro os controles (sintéticos) e só depois o dado real; se um
   controle falhar, aborta sem tocar no dado real.
