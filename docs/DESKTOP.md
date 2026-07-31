# Volante+ Desktop (Windows)

Terceira plataforma do Volante+, ao lado do Android (`app/`) e da web
(`web/`): um app desktop via [Compose Multiplatform](https://www.jetbrains.com/lp/compose-multiplatform/),
empacotado como `.msi`/`.exe` para Windows.

## Arquitetura

```
Volante-Plus/
├── shared/                 # Kotlin Multiplatform: domínio puro
│   └── src/commonMain/kotlin/com/volanteplus/loterias/
│       ├── domain/backtest/    # BacktestAnalyzer, BacktestEngine, PrizeRules, Statistics
│       ├── domain/generator/   # GameGenerator
│       ├── domain/model/       # Draw, Lottery, GameBatch, GeneratedGame, etc.
│       └── data/
│           ├── repository/     # DrawRepository (interface) + InMemoryDrawRepository
│           └── seed/           # CsvDrawParser
├── app/                     # Android — depende de :shared, mantém Room/Context próprios
└── desktop/                 # Este módulo nôvo
    └── src/main/
        ├── kotlin/com/volanteplus/desktop/
        │   ├── Main.kt              # application{} + Window + atalhos de teclado
        │   └── ui/{theme,navigation,volante,backtest}/
        └── resources/
            ├── font/*.ttf            # Open Sans (mesmos arquivos do Android)
            └── icon.ico              # Ícone do instalador (256×256 + 48/32/16)
```

`:shared` existe a partir deste trabalho — antes dele havia só o módulo
`:app` (nada de Kotlin Multiplatform no projeto). A extração foi possível
porque `domain/` já era Kotlin puro (nenhum import de `android.*`); o que
não é portável (Room, `Context`, Retrofit) continua em `:app`.

### Por que a UI não está em commonMain ainda

`ui/volante/VolanteScreen.kt` e `ui/backtest/BacktestScreen.kt` do Android
foram **copiados e adaptados** para `desktop/`, não movidos para
`:shared` — como o próprio pedido desta fase permite explicitamente. As
adaptações necessárias:

| Android | Desktop |
|---|---|
| `androidx.lifecycle.ViewModel` + `viewModelScope` | Classe comum com seu próprio `CoroutineScope`, cancelado em `dispose()` |
| `viewModel(factory = ...)` (Compose) | `remember { ViewModel(...) }` + `DisposableEffect` em `Main.kt` |
| `collectAsStateWithLifecycle()` | `collectAsState()` (sem Activity/lifecycle) |
| `stringResource(R.string...)` | Strings literais (sem sistema de recursos Android) |
| `Font(R.font.xxx, peso)` | `Font("font/xxx.ttf", peso)` — recurso de classpath, não `R.font` |
| "Sincronizar histórico" (API Caixa + Room) | "Importar CSV" (`java.awt.FileDialog` + o mesmo `CsvDrawParser` do seed Android) |
| Card de próximo concurso | Removido nesta primeira versão (ver limitações) |

Migrar essas telas para `commonMain` de verdade é um passo futuro razoável
(o essencial — Material3, `LazyVerticalGrid`, etc. — já é 100%
multiplataforma), mas não foi feito agora para manter esta entrega
delimitada.

## Persistência: por decisão explícita, não há nesta versão

Room (usado pelo Android) não roda em JVM desktop puro sem migração para o
driver multiplataforma mais recente — uma mudança que também afetaria o
Android. Optou-se por **não** adicionar SQLDelight nem migrar Room agora:
o desktop guarda o histórico só em memória (`InMemoryDrawRepository`,
promovido de um test double do Android para `:shared`), populado via
**Importar CSV** na tela de Backtesting (mesmo formato do seed do Android —
ver `app/src/main/assets/seed/README.md`). Fechar o app descarta o
histórico importado; reabrir exige importar de novo. Adicionar persistência
real é um follow-up natural, não incluído aqui.

Pelo mesmo motivo, não há busca do próximo concurso no desktop ainda —
`GetNextDrawInfoUseCase`/`CaixaLotteryApi` continuam exclusivos do Android.

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl+G` | Gera jogos com o lote atual (só na tela Volante) |
| `Ctrl+B` | Vai para a tela de Backtesting |

Implementados via `onPreviewKeyEvent` do próprio `Window` (Compose
Desktop) — funcionam com a janela em foco, independente de qual elemento
interno está focado.

## Rodando e compilando

```bash
./gradlew :desktop:run              # roda o app localmente
./gradlew :desktop:compileKotlinDesktop   # só compila
```

**Não foi possível rodar nenhum desses comandos nesta sessão**: o sandbox
onde este código foi escrito bloqueia `dl.google.com` (repositório Maven do
Google — AGP e todo o AndroidX/Compose vêm de lá) por política de rede,
então nenhum `./gradlew` deste repositório roda localmente aqui — isso já
valia para o `:app` original, antes de qualquer mudança desta fase. O
código foi revisado manualmente contra a documentação oficial e o
código-fonte do Compose Multiplatform (assinaturas de `rememberWindowState`,
`Window(onPreviewKeyEvent = ...)`, `Font(resource = ...)`), mas **a
primeira compilação de verdade acontece no CI** (`.github/workflows/desktop-ci.yml`
e `android-ci.yml`, que rodam em runners do GitHub sem essa restrição).
Rode localmente antes de confiar cegamente nesta entrega.

## Empacotamento Windows (.msi / .exe)

```bash
./gradlew :desktop:packageMsi
./gradlew :desktop:packageExe
```

Gera os instaladores em `desktop/build/compose/binaries/main/{msi,exe}/`.

**`jpackage` (usado por baixo dos dois comandos acima) não faz
cross-compilation**: só produz instalador para o sistema operacional em
que está rodando. Isso significa que esses comandos só funcionam de
verdade **rodando num Windows** — não há como gerar o `.msi` a partir
deste ambiente Linux. `.github/workflows/desktop-ci.yml` roda em
`windows-latest` exatamente por isso: é o único lugar, neste projeto, onde
o instalador é gerado e verificado automaticamente.

### UUID de upgrade

`desktop/build.gradle.kts` fixa `windows.upgradeUuid` como
`a62a01fd-1cde-4f97-8941-e55fe8722911` (gerado uma única vez, em
31/07/2026). **Nunca troque esse valor entre releases** — é ele que faz o
Windows reconhecer uma instalação existente e fazer upgrade, em vez de
criar uma segunda entrada em "Aplicativos e recursos".

### Convertendo para MSIX (manual)

O Compose Desktop não gera `.msix` diretamente. Para publicar na Microsoft
Store como app nativo empacotado (diferente do fluxo de PWA documentado em
`docs/MICROSOFT_STORE.md`), converta o `.msi` gerado:

1. Instale o [MSIX Packaging Tool](https://apps.microsoft.com/detail/9n5lw3jbcxkf)
   (gratuito, Microsoft Store) numa máquina Windows.
2. Abra o `.msi` de `desktop/build/compose/binaries/main/msi/` no MSIX
   Packaging Tool e siga o assistente de conversão, **ou** via linha de
   comando (também requer Windows):
   ```
   msix-packaging-tool.exe create-package --template config.xml
   ```
   (o MSIX Packaging Tool gera esse `config.xml` de template na primeira
   conversão feita pelo assistente gráfico).

### Testando o instalador

Instale o `.msi` (ou `.exe`) gerado numa **VM Windows limpa** (sem o
Volante+ instalado antes) e confirme: instalação sem erros, atalho no menu
"Volante+" (grupo definido por `windows.menuGroup`), o app abre e os
atalhos Ctrl+G/Ctrl+B funcionam, e a desinstalação via "Aplicativos e
recursos" remove tudo. Esse passo é manual — não há como automatizar teste
de instalador em VM a partir deste repositório.

## Ícone

`desktop/src/main/resources/icon.ico` (16/32/48/256px) foi gerado a partir
do mesmo ícone-placeholder usado no PWA e na extensão de navegador (não
existe nenhum ícone de marca próprio no projeto Android ainda — ver
`docs/MICROSOFT_STORE.md`). Troque por um ícone definitivo assim que
houver um.
