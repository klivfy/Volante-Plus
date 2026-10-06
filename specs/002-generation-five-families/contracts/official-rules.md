# Contrato: `web/src/data/rules/official-rules.json`

Fonte única das regras de prêmio das duas modalidades (research.md, R1). Lido
pelo motor web (`engine/officialRules.ts`, que valida na carga) e pelos testes
de paridade do Kotlin. Copiado para os assets do Android por
`scripts/sync-shared-models.mjs`.

## Formato

```jsonc
{
  "rulesVersion": "1.0.0",
  "checkedAt": "2026-10-06",
  "lotteries": {
    "megasena": {
      "price": { "value": 6.0, "since": "2025-07-09", "source": "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx", "checkedAt": "2026-10-06" },
      "priceEras": [ { "fromContest": 1, "toContest": 0, "price": 0, "source": "…" } ],
      "grossPrizeShare": { "value": 0.4379, "source": "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx", "checkedAt": "2026-10-06" },
      "deductionOrder": ["shares"],
      "tiers": [
        { "index": 1, "key": "6", "numberHits": 6, "payout": { "kind": "share", "fraction": 0.40 }, "noWinner": "accumulate-same-tier" },
        { "index": 2, "key": "5", "numberHits": 5, "payout": { "kind": "share", "fraction": 0.13 }, "noWinner": "accumulate-same-tier" },
        { "index": 3, "key": "4", "numberHits": 4, "payout": { "kind": "share", "fraction": 0.15 }, "noWinner": "accumulate-same-tier" }
      ],
      "accumulations": [
        { "kind": "final05", "share": 0.22, "source": "…" },
        { "kind": "virada", "share": 0.10, "source": "…" }
      ],
      "specialContests": [
        { "kind": "virada", "detect": "last-final05-of-year", "shares": [0.90, 0.05, 0.05], "noWinner": "roll-down", "source": "…" }
      ],
      "tax": { "rate": 0.30, "exemptionThreshold": null, "source": "…", "checkedAt": "…" }
    },
    "maismilionaria": {
      "price": { "value": 6.0, "…": "…" },
      "grossPrizeShare": { "value": 0.4379, "…": "…" },
      "deductionOrder": ["reserve", "fixed", "shares"],
      "reserve": { "share": 0.05, "minTopPrizeNet": 10000000, "overflowCapNet": 100000000, "idleMonths": 12, "source": "…" },
      "tiers": [
        { "index": 1,  "key": "6+2",   "numberHits": 6, "trevoHits": [2],    "payout": { "kind": "share", "fraction": 0.62 }, "noWinner": "accumulate-same-tier" },
        { "index": 2,  "key": "6+1/0", "numberHits": 6, "trevoHits": [1, 0], "payout": { "kind": "share", "fraction": 0.10 }, "noWinner": "cascade-next-tier" },
        { "index": 3,  "key": "5+2",   "numberHits": 5, "trevoHits": [2],    "payout": { "kind": "share", "fraction": 0.08 }, "noWinner": "cascade-next-tier" },
        { "index": 4,  "key": "5+1/0", "numberHits": 5, "trevoHits": [1, 0], "payout": { "kind": "share", "fraction": 0.08 }, "noWinner": "cascade-next-tier" },
        { "index": 5,  "key": "4+2",   "numberHits": 4, "trevoHits": [2],    "payout": { "kind": "share", "fraction": 0.06 }, "noWinner": "cascade-next-tier" },
        { "index": 6,  "key": "4+1/0", "numberHits": 4, "trevoHits": [1, 0], "payout": { "kind": "share", "fraction": 0.06 }, "noWinner": "to-top-next-contest" },
        { "index": 7,  "key": "3+2",   "numberHits": 3, "trevoHits": [2],    "payout": { "kind": "fixed", "amount": 50 } },
        { "index": 8,  "key": "3+1",   "numberHits": 3, "trevoHits": [1],    "payout": { "kind": "fixed", "amount": 24 } },
        { "index": 9,  "key": "2+2",   "numberHits": 2, "trevoHits": [2],    "payout": { "kind": "fixed", "amount": 12 } },
        { "index": 10, "key": "2+1",   "numberHits": 2, "trevoHits": [1],    "payout": { "kind": "fixed", "amount": 6 } }
      ],
      "specialContests": [],
      "tax": { "rate": 0.30, "exemptionThreshold": null, "…": "…" }
    }
  }
}
```

`"…"` marca campos a preencher com a fonte e a data reais na fase 1. Um valor
`null` (ex.: `exemptionThreshold` antes da confirmação de research.md, R4)
torna indisponíveis só as medidas que dependem dele.

## Validação na carga (falha = erro de build/teste, nunca silêncio)

1. Toda chave numérica tem `source` e `checkedAt` no próprio objeto ou no
   objeto pai.
2. `tiers[].index` começa em 1 e é contíguo; `key` é única.
3. Para cada modalidade, a soma das probabilidades exatas das faixas é igual à
   chance de prêmio calculada independentemente: 0,0877961323 (+Milionária) e
   0,0004352441 (Mega), com tolerância de 1e-12.
4. Conservação: retorno imediato esperado por aposta ≤ `price ×
   grossPrizeShare` (tolerância de um centésimo de centavo).
5. `deductionOrder` contém só `reserve`, `fixed`, `shares`, cada um no máximo
   uma vez, e `reserve` só existe se `reserve` estiver definido.
6. `noWinner` é coerente com a modalidade: `cascade-next-tier` só na
   +Milionária, `roll-down` só em `specialContests`.

## Compatibilidade

- `prizeRules.ts` passa a derivar `PrizeTier`, `classifyHits`, `isPrized` e
  `prizeTiers` deste arquivo. As chaves antigas da +Milionária (`6+1`, `6+0`,
  `5+1`…) deixam de existir; todo uso no código e nos testes é migrado no
  mesmo PR.
- `PrizeTable.kt` mantém sua API; o teste `PrizeTableParityTest` lê este
  arquivo e compara faixa a faixa, fração a fração e o retorno esperado de
  referência.
