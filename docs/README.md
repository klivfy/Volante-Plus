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

`domain/generator/GameGenerator.kt` concentra toda a geração de jogos
simples (sempre 6 dezenas). Não há estratégia selecionável pelo usuário: o
gerador tem **uma** estratégia padrão e uma legada de laboratório, ambas
guiadas pela lista de `NumberPerformance` (não vazia) produzida pelo
`BacktestAnalyzer`:

- **`UNPOPULAR` (padrão)** — sorteio **uniforme** das dezenas com
  **desempate por rateio**: entre `PAYOUT_CANDIDATES` (12) jogos sorteados
  fica o menos popular segundo `Unpopularity.penalty` (que penaliza datas,
  sequências, padrões do volante e recompensa as dezenas recém-sorteadas).
  A chance de acertar é exatamente a de qualquer outro jogo — o desempate só
  reduz com quantos apostadores o prêmio seria dividido. Na +Milionária, as
  duplas de trevos do lote são **complementares** (distintas; com 3 jogos,
  disjuntas e cobrindo os 6 trevos), maximizando a chance de pelo menos um
  prêmio pelo mesmo custo.
- **`FREQUENCY_TIERS` (legado)** — a estratégia anterior, por tiers de
  frequência histórica (40% TOP / 30% MID / 30% LOW, com meta de 70% das
  vagas no TOP). Só é usada pelo backtest e pelo laboratório, que existem
  para medir que ela não supera o acaso. Rótulo: `Backtest-Driven`.

Ambos os métodos aceitam `pool` (modo Fechamento), que restringe o sorteio
às dezenas marcadas no volante. O modo Fechamento em si usa o
`ClosureDesigner` (covering design com garantia verificada), não o
`GameGenerator` — ver `ClosureDesigner.kt`.

A calibração brasileira da medida de popularidade (substituir a heurística
por um modelo ajustado às contagens oficiais de ganhadores por faixa) está
especificada em `specs/003-popularity-calibration/`. O estudo completo das
avenidas de precisão — com medições de poder estatístico, estrutura de lote,
timing de concurso e roadmap priorizado — está em
[`estudo-precisao-geracao.md`](estudo-precisao-geracao.md).

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
- `GameGenerator.PAYOUT_CANDIDATES = 12` — candidatos sorteados por vaga no
  desempate por rateio (valor medido: 77% do ganho disponível, concentração
  desprezível — tabela no kdoc da constante).
- `GameGenerator.TOP_TIER_SHARE = 0.7` — fração-alvo de dezenas do tier
  `TOP` por jogo na estratégia legada `FREQUENCY_TIERS` (laboratório).

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
