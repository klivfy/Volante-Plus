# Volante+ — Laboratório Estatístico de Loterias

[![Android CI](https://github.com/Mestrys/Volante-Plus/actions/workflows/android-ci.yml/badge.svg)](https://github.com/Mestrys/Volante-Plus/actions/workflows/android-ci.yml)
[![Web CI](https://github.com/Mestrys/Volante-Plus/actions/workflows/web-ci.yml/badge.svg)](https://github.com/Mestrys/Volante-Plus/actions/workflows/web-ci.yml)
[![Desktop CI](https://github.com/Mestrys/Volante-Plus/actions/workflows/desktop-ci.yml/badge.svg)](https://github.com/Mestrys/Volante-Plus/actions/workflows/desktop-ci.yml)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Mestrys/Volante-Plus&root-directory=web)

App Android (Kotlin + Jetpack Compose, Material Design 3), versão web
(Next.js + PWA, ver `web/`) e app desktop para Windows (Compose
Multiplatform, ver `desktop/`) para teste de hipóteses estatísticas sobre
Mega-Sena e +Milionária. O domínio (backtesting, geração de jogos) é
compartilhado entre Android e desktop via `shared/` (Kotlin Multiplatform).

> Gerador estatístico para Mega-Sena e +Milionária. Sem palpite, sem número quente.

## Missão

Usar o histórico das loterias para testar, validar ou refutar empiricamente modelos
matemáticos via backtesting transparente — sem promessas de "números quentes".

## Estrutura do projeto

```
Volante-Plus/
├── build.gradle.kts                # Configuração raiz (plugins)
├── settings.gradle.kts             # Módulos e repositórios
├── gradle/libs.versions.toml       # Version catalog (AGP, Kotlin, Compose BOM)
└── app/
    ├── build.gradle.kts            # Módulo Android (Compose, MD3, minSdk 26)
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── java/com/volanteplus/loterias/
        │   │   ├── MainActivity.kt
        │   │   ├── VolanteApplication.kt   # Container manual de dependências
        │   │   ├── data/
        │   │   │   ├── local/              # Room: entidade, DAO, database, converters
        │   │   │   ├── remote/             # Cliente da API do Portal de Loterias (Caixa)
        │   │   │   ├── seed/               # Parser CSV + seeder de assets/seed/
        │   │   │   └── repository/         # DrawRepository (contrato do backtesting)
        │   │   ├── domain/
        │   │   │   ├── backtest/
        │   │   │   │   ├── BacktestEngine.kt   # Corte, validação e métricas
        │   │   │   │   └── PrizeRules.kt       # Faixas de premiação oficiais
        │   │   │   ├── generator/
        │   │   │   │   └── GameGenerator.kt    # Lotes sem repetição de dezenas
        │   │   │   ├── model/
        │   │   │   │   ├── Lottery.kt      # Regras de negócio: faixas e limites
        │   │   │   │   └── Draw.kt         # Resultado histórico validado
        │   │   │   └── usecase/
        │   │   │       └── SyncDrawHistory.kt  # Sincronização incremental via API
        │   │   ├── ui/theme/
        │   │   │   ├── Color.kt            # Paleta MD3 (light/dark)
        │   │   │   ├── Type.kt             # Tipografia 100% Open Sans
        │   │   │   └── Theme.kt            # VolantePlusTheme
        │   │   ├── ui/backtest/
        │   │   │   ├── BacktestViewModel.kt # Config, sincronização e relatório
        │   │   │   └── BacktestScreen.kt    # Tela de backtesting
        │   │   └── ui/volante/
        │   │       ├── VolanteViewModel.kt # Estado + regras de seleção
        │   │       └── VolanteScreen.kt    # Abas, grid de dezenas, trevos
        │   └── res/
        │       ├── font/                   # Open Sans (400/500/600/700)
        │       └── values/                 # strings (slogan), tema-ponte
        └── test/                           # Testes unitários do ViewModel
```

## Regras de negócio implementadas

| Loteria | Dezenas | Mínimo | Máximo | Trevos |
|---|---|---|---|---|
| Mega-Sena | 01–60 | 8 | 15 | — |
| +Milionária | 01–50 | 8 | 12 | exatamente 2 (de 1–6) |

- Abas principais: **Mega-Sena** / **+Milionária** (seleção preservada ao alternar).
- Sub-abas: **Jogos avulsos** / **Fechamento**.
- Trevos (+Milionária): estratégias **Econômico** (1 dupla) e **Cobertura total** (15 duplas).
- Slogan fixo no topo das telas de geração.

## Build

Requer JDK 17+ e Android SDK (compileSdk 35).

```bash
./gradlew :app:assembleDebug      # build
./gradlew :app:testDebugUnitTest  # testes unitários
```

## Roadmap

- [x] Setup MD3 + Open Sans + tela de Volante
- [x] Persistência do histórico de concursos (Room SQLite)
- [x] Importação do histórico oficial (API da Caixa + seed CSV em `assets/seed/`)
- [x] Gerador de lotes (Aleatório puro RNG criptográfico / Equilibrado) sem repetição de dezenas
- [x] Motor de backtesting (data de corte, eficácia, variância, desvio padrão)
- [x] Tela de backtesting (configurar corte/estratégia, sincronizar histórico e visualizar relatório)
- [x] Modo Fechamento (desdobra as dezenas marcadas no volante com repetição mínima)
- [x] Estratégia "Mais sorteadas" (números quentes) sob o protocolo de backtesting
- [ ] Popular `assets/seed/` com o histórico oficial (exportação local — rede bloqueada no ambiente de desenvolvimento remoto)
