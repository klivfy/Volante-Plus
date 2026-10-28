# Volante+ — Documentação técnica

Laboratório estatístico de loterias (Mega-Sena e +Milionária): gera jogos,
sincroniza o histórico oficial da Caixa e roda backtests contra esse
histórico. Android nativo, Kotlin + Jetpack Compose, injeção manual (sem
Hilt/Koin). Este documento cobre o app Android — para web e desktop, ver
`docs/WEB.md` e `docs/DESKTOP.md`.

> **Nota:** `domain/` (backtesting, geração de jogos, modelos) e
> `data/repository`/`data/seed` (interface `DrawRepository` e
> `CsvDrawParser`) não moram mais em `app/`, e sim no módulo Kotlin
> Multiplatform `shared/` — compartilhados com o app desktop (`desktop/`,
> ver `docs/DESKTOP.md`). Os caminhos abaixo foram atualizados de acordo.

## Gerador de Jogos

`domain/generator/GameGenerator.kt` concentra toda a geração de jogos simples.
Desde a unificação das estratégias, existe **uma única forma de gerar** — a
partir do desempenho medido no backtesting (`strategyLabel` em `GameBatch` é
rótulo de exibição, não uma escolha do usuário):

- **Entrada:** uma `List<NumberPerformance>` (uma dezena, um `score` de 0 a 1
  e um `PerformanceTier`) produzida pelo `BacktestAnalyzer` a partir da
  janela de treino.
- **Sorteio por tier:** cada vaga do jogo sorteia primeiro um tier
  (`TOP_TIER_SHARE` = 70%, `MID_TIER_SHARE` = 20%, o restante 10% para o
  `LOW`) e depois uma dezena dentro do tier, sem repetição no jogo.
- **Seleção anti-popular:** geram-se `PAYOUT_CANDIDATES` (12) jogos pelo
  processo acima e fica com o **menos popular** entre eles (menor expectativa
  de divisão de prêmio, ver `unpopularity`), não com o "melhor" — a chance de
  acerto é idêntica para qualquer combinação, e o app não promete o contrário.
- **Jogo repetido:** candidato igual a outro já no lote é resorteado até
  `MAX_DEDUP_ATTEMPTS` (10) vezes; passando disso, é aceito com aviso no log.
  (A versão web vai além — deduplicação absoluta de dezenas entre os jogos do
  lote, ver `gameGenerator.ts`.)
- **Modo Fechamento:** todos os métodos aceitam `pool` — restringe o sorteio
  às dezenas marcadas no volante.

Na web, o fluxo é o mesmo (`gameGenerator.ts` espelha estas constantes); o
botão "Usar estes dados" na tela de Backtesting dirige o sorteio com o
resultado do backtest (na web via `PerformanceCache`/IndexedDB, no Android
via `PerformanceCache` em `ui/navigation/NavGraph.kt`).

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
- `GameGenerator.TOP_TIER_SHARE = 0.7` / `MID_TIER_SHARE = 0.2` — fração-alvo
  de dezenas por tier em cada jogo (o restante, 0.1, vem do tier `LOW`).
- `GameGenerator.PAYOUT_CANDIDATES = 12` — jogos candidatos gerados por lote
  para escolher o menos popular.

## Estrutura de diretórios (resumo)

```
shared/src/commonMain/kotlin/com/volanteplus/loterias/   # Kotlin Multiplatform
├── data/
│   ├── repository/  DrawRepository (interface) / InMemoryDrawRepository
│   └── seed/        CsvDrawParser
└── domain/
    ├── backtest/    BacktestEngine, BacktestAnalyzer, PrizeRules, Statistics
    ├── generator/   GameGenerator
    └── model/       Draw, Lottery, Generation, NumberPerformance, NextDrawInfo

app/src/main/java/com/volanteplus/loterias/               # Só Android
├── data/
│   ├── local/       Room (DrawEntity, DrawDao, VolanteDatabase, Converters)
│   ├── remote/      API da Caixa (CaixaDrawDto, NextDrawDto, CaixaLotteryApi)
│   ├── repository/  RoomDrawRepository (implementa DrawRepository de :shared)
│   └── seed/        AssetDrawSeeder (Context/assets, usa CsvDrawParser de :shared)
├── domain/
│   └── usecase/     SyncDrawHistory, GetNextDrawInfoUseCase
└── ui/
    ├── backtest/    BacktestScreen, BacktestViewModel
    ├── navigation/  PerformanceCache (ponte Backtest -> Volante)
    ├── theme/       MD3 + Open Sans
    └── volante/     VolanteScreen, VolanteViewModel
```
