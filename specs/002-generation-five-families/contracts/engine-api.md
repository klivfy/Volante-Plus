# Contrato: API pública do motor (`web/src/engine/`) usada pela UI

Assinaturas indicativas em TypeScript. O que é contrato aqui são os nomes, os
tipos de entrada e saída e as **invariantes**; a implementação pode organizar
os arquivos de outra forma. Funções existentes que mudam de comportamento
estão marcadas.

## Regras e prêmios

```ts
// officialRules.ts — novo
function officialRules(lottery: Lottery): OfficialRules;          // valida na carga; lança se o arquivo violar o contrato

// prizeRules.ts — MUDA: derivado de official-rules.json
function prizeTiers(lottery: Lottery): readonly PrizeTier[];       // 3 (Mega) ou 10 (+Milionária)
function classifyHits(lottery: Lottery, numberHits: number, trevoHits?: number): PrizeTier | null;
//   +Milionária: trevoHits é obrigatório (RangeError se ausente) — fecha a classe de bug de R2
function isPrized(lottery: Lottery, numberHits: number, trevoHits?: number): boolean;

// powerAnalysis.ts — MUDA
function anyPrizeProbability(lottery: Lottery): number;             // 1/2.297,56 (Mega) e 1/11,39 (+Milionária)

// prizeModel.ts — novo
interface PrizeModelInput {
  lottery: Lottery;
  tickets: number;                                                  // apostas simples equivalentes do concurso
  accumulated?: { top?: number; final05?: number; special?: number; reserveBalance?: number };
  special?: SpecialKind;                                            // ex.: 'virada'
  amountsAreNet: boolean;                                           // research.md, R4
}
interface ExpectedReturn {
  preTax: number; postTax: number;                                  // R$ por aposta simples
  byTier: Record<string, { preTax: number; postTax: number }>;
  immediate: number; deferred: number;                              // pago agora × acumulado para depois
}
function expectedReturnPerBet(input: PrizeModelInput, game?: GeneratedGame): ExpectedReturn;
//   sem `game`: aposta média (uniforme). Com `game`: usa a popularidade do jogo no rateio.
```

## Valor do concurso

```ts
// services/caixaApi.ts — novo
function fetchContestOutlook(lottery: Lottery): Promise<ContestOutlook | null>;   // nunca lança

// demandModel.ts — novo
function estimateTickets(outlook: ContestOutlook, override?: number):
  { tickets: number; source: 'model' | 'lastCollection' | 'user' } | null;

// contestValue.ts — novo
function assessContest(outlook: ContestOutlook, batch?: GameBatch, override?: { tickets?: number }): ValueAssessment;
function mandelTest(outlook: ContestOutlook, tickets: number): MandelResult;
function viradaRollDown(outlook: ContestOutlook, tickets: number): { probability: number; evContribution: number };
```

Invariantes:

- `assessContest` devolve `availability: { unavailable, reason }` e **nenhum**
  número quando falta dado necessário ou a regra do concurso especial é
  desconhecida.
- `returnPerReal.preTax < 1` em todo cenário de teste; se algum dia for ≥ 1,
  o resultado carrega a marca `nonNegativeEv: true` (FR-021) e a UI troca de
  texto, nunca de tom ("compre").
- `mandelTest` não tem parâmetro nem saída que represente "recomendação".

## Popularidade e geração

```ts
// popularity/model.ts — novo
function activePopularity(lottery: Lottery): { decision: PopularityDecision; expired: boolean };
function relativePopularity(lottery: Lottery, numbers: readonly number[], trevoPair?: [number, number]): number;
function expectedWinnersByTier(lottery: Lottery, draw: Draw, tickets: number): Record<string, number>;   // validação e A10

// gameGenerator.ts — MUDA (assinatura preservada)
function generateGames(lottery: Lottery, count: number, performances: NumberPerformance[], options?: GenerateOptions): GameBatch;
//   UNPOPULAR (padrão): candidatos uniformes → escolha pela popularidade ativa → trevos complementares (+Milionária)
//   aplica ForensicGate: só CURRENT_REPLICATED altera a amostragem

// batchStructure.ts — novo
function pAnyPrize(lottery: Lottery, games: readonly GeneratedGame[]): number;                       // exato
function complementaryTrevoPairs(n: number, pairPopularity?: (pair: [number, number]) => number): [number, number][];
```

Invariantes:

- **Chance intocada**: para qualquer `options`, os jogos gerados têm, por
  teste de propriedade, a distribuição de acertos hipergeométrica exata da
  modalidade (qui-quadrado sobre 100 mil jogos contra a teórica, com controle
  positivo: um gerador enviesado de propósito tem de falhar o teste).
- **Isolamento do laboratório**: `gameGenerator.ts` não importa
  `strategyBenchmark.ts`, `predictors/*` nem `audit/moduleB.ts`; um teste de
  grafo de importação garante isso (FR-031).
- **Determinismo**: com `RandomSource` injetado e semeado, o lote é idêntico
  entre execuções.
- `pAnyPrize` confere com enumeração por força bruta nos casos pequenos e com
  os valores de research.md, R10.

## Fechamento

```ts
// closureDesigner.ts — MUDA
interface Guarantee { numbers: number; trevosMin: 0 | 1 | 2 }
function offeredGuarantees(lottery: Lottery): Guarantee[];        // só as que pagam pelas regras
function generateClosure(lottery: Lottery, pool: readonly number[], guarantee: Guarantee,
                         options?: ClosureOptions): GameBatch & { contract: ClosureContract };
function verifyClosure(design: ClosureDesign, guarantee: Guarantee, trevoPairs?: [number, number][]): boolean;   // exaustiva
```

Invariante: `generateClosure` nunca devolve um contrato com
`verified.method !== 'exhaustive'`.

## Laboratório e auditoria

```ts
// audit/moduleB.ts — MUDA (v2)
function runModuleB(dataset: DrawDataset, options?: ModuleBOptions): ModuleBReport;   // 12 estratégias, duas modalidades, com trevos

// audit/index.ts — MUDA
function runAudit(dataset: DrawDataset, options?: AuditOptions): AuditReport;          // A1–A10

// audit/gate.ts — novo
function forensicGate(report: AuditReport, now: Date): GateDecision;
```

Invariante: `forensicGate` só devolve `CURRENT_REPLICATED` com `evidence`
não vazia apontando para testes do regime atual cuja replicação usou
concursos posteriores ao commit do pré-registro.
