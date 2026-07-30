# Volante+ — Documentação técnica

Laboratório estatístico de loterias (Mega-Sena e +Milionária): gera jogos,
sincroniza o histórico oficial da Caixa e roda backtests contra esse
histórico. Android nativo, Kotlin + Jetpack Compose, injeção manual (sem
Hilt/Koin).

## Gerador de Jogos

`domain/generator/GameGenerator.kt` concentra toda a geração de jogos
simples (sempre 6 dezenas). Duas famílias de algoritmo convivem hoje:

- **`generate(lottery, strategy, gameCount, ...)`** — estratégias clássicas
  (ver seção "Estratégias" abaixo), com a **regra de repetição mínima**:
  nenhuma dezena se repete entre os jogos do lote enquanto houver dezena
  inédita disponível no pool.
- **`generateWithPerformances(lottery, performances, gameCount, ...)`** —
  algoritmo **baseado em tiers**: recebe uma `List<NumberPerformance>`
  (uma dezena, um `score` de 0 a 1 e um `PerformanceTier`) produzida pelo
  `BacktestAnalyzer` e monta cada jogo priorizando o tier `TOP`. A fração-alvo
  de dezenas do tier `TOP` por jogo é `GameGenerator.TOP_TIER_TARGET_RATIO`
  (0.7, ou seja, ~4 das 6 dezenas); o restante vem dos demais tiers. Ao
  contrário de `generate()`, não há repetição mínima entre jogos do lote —
  cada jogo é sorteado de forma independente a partir do mesmo ranking.

Ambos os métodos aceitam `pool` (modo Fechamento): restringe o sorteio às
dezenas marcadas no volante.

## Estratégias

`domain/model/Generation.kt` define `GenerationStrategy`:

| Estratégia | Uso | Histórico exigido? |
|---|---|---|
| `RANDOM` (Aleatório puro) | RNG criptográfico (`SecureRandom`), zero viés | Não |
| `BALANCED` (Equilibrado) | 3 dezenas pares + 3 ímpares por jogo | Não |
| `FREQUENCY` (Mais sorteadas) | Prioriza as dezenas mais frequentes da janela de treino — hipótese que o backtesting existe para refutar | Sim (só roda na tela de Backtesting) |
| **`BACKTEST_DRIVEN` (Backtest-Driven)** | Usa o `List<NumberPerformance>` de um backtest já executado (ver "Próximo Concurso"/fluxo abaixo) para priorizar dezenas do tier `TOP` | Não no momento da geração — o histórico já foi consumido ao rodar o backtest |

**Fluxo do Backtest-Driven**: na tela de Backtesting, após rodar um
backtest, o `BacktestAnalyzer` calcula o desempenho de cada dezena na janela
de treino; o botão "Usar estes dados para gerar jogos" grava esse resultado
no `PerformanceCache` (`ui/navigation/NavGraph.kt`) e navega para a tela de
Volante. Lá, selecionando a estratégia Backtest-Driven, `generateBatch()`
lê o cache e chama `generateWithPerformances`. Sem um backtest rodado antes,
a tela mostra uma mensagem pedindo para rodar o backtest primeiro — não há
crash nem geração com dados incompletos.

## Próximo Concurso

`data/remote/NextDrawDto.kt` + `domain/model/NextDrawInfo.kt` +
`domain/usecase/GetNextDrawInfoUseCase.kt`: buscam data e prêmio estimado do
próximo concurso na API da Caixa (mesmo endpoint do último concurso —
`CaixaLotteryApi.fetchNextDraw`). `dataProximoConcurso` e
`valorEstimadoProximoConcurso` são nulos na API quando o próximo concurso
ainda não foi configurado; o mapper (`NextDrawDto.toDomain`) reflete isso
retornando `null` nesse caso, e `GetNextDrawInfoUseCase` expõe
`Flow<NextDrawInfo?>`, emitindo `null` tanto para falha de rede quanto para
dado ainda indisponível — a tela nunca trava por causa desses dados
auxiliares.

## Limites

- `GameGenerator.MIN_GAMES = 2` — lote mínimo (evita lote degenerado de 1 jogo).
- `GameGenerator.MAX_GAMES = 5` — teto do lote (antes era 10; reduzido por
  custo de geração/renderização de lotes grandes).
- `GameGenerator.GAME_SIZE = 6` — dezenas por jogo (fixo, `Draw.NUMBERS_DRAWN`).
- `GameGenerator.TOP_TIER_TARGET_RATIO = 0.7` — fração-alvo de dezenas do
  tier `TOP` por jogo na geração Backtest-Driven.

## Estrutura de diretórios (resumo)

```
app/src/main/java/com/volanteplus/loterias/
├── data/
│   ├── local/       Room (DrawEntity, DrawDao, VolanteDatabase, Converters)
│   ├── remote/      API da Caixa (CaixaDrawDto, NextDrawDto, CaixaLotteryApi)
│   ├── repository/  DrawRepository / RoomDrawRepository
│   └── seed/        Seed CSV embarcado (AssetDrawSeeder, CsvDrawParser)
├── domain/
│   ├── backtest/    BacktestEngine, BacktestAnalyzer, PrizeRules, Statistics
│   ├── generator/   GameGenerator
│   ├── model/       Draw, Lottery, Generation, NumberPerformance, NextDrawInfo
│   └── usecase/     SyncDrawHistory, GetNextDrawInfoUseCase
└── ui/
    ├── backtest/    BacktestScreen, BacktestViewModel
    ├── navigation/  PerformanceCache (ponte Backtest -> Volante)
    ├── theme/       MD3 + Open Sans
    └── volante/     VolanteScreen, VolanteViewModel
```
