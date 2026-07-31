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
│       ├── domain/model/       # Draw, Lottery, GameBatch, GeneratedGame, NextDrawInfo, etc.
│       ├── domain/usecase/     # GetNextDrawInfoUseCase, DetectNewContestUseCase
│       └── data/
│           ├── remote/         # CaixaLotteryApi / HttpCaixaLotteryApi (API da Caixa)
│           ├── repository/     # DrawRepository (interface) + InMemoryDrawRepository
│           └── seed/           # CsvDrawParser
├── app/                     # Android — depende de :shared, mantém Room/Context próprios
└── desktop/                 # Este módulo nôvo
    └── src/main/
        ├── kotlin/com/volanteplus/desktop/
        │   ├── Main.kt              # application{} + Window + Tray + atalhos de teclado
        │   ├── notification/       # NextDrawNotifier (glue: DetectNewContestUseCase + Tray)
        │   ├── prefs/               # DesktopPreferences (java.util.prefs)
        │   ├── theme/               # detectWindowsDarkTheme (registro do Windows)
        │   └── ui/{theme,navigation,volante,backtest}/
        └── resources/
            ├── icon.ico              # Ícone do instalador (256×256 + 48/32/16)
            └── tray_icon.png         # Ícone da bandeja (32×32 — ImageIO não lê .ico)
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
| Open Sans (`Font(R.font.xxx, peso)`) | Fonte padrão do sistema (ver nota abaixo) |
| "Sincronizar histórico" (API Caixa + Room) | "Importar CSV" (`java.awt.FileDialog` + o mesmo `CsvDrawParser` do seed Android) |
| Card de próximo concurso | O mesmo `NextDrawCard`, alimentado por `GetNextDrawInfoUseCase` (agora em `:shared`, ver abaixo) |

Migrar essas telas para `commonMain` de verdade é um passo futuro razoável
(o essencial — Material3, `LazyVerticalGrid`, etc. — já é 100%
multiplataforma), mas não foi feito agora para manter esta entrega
delimitada.

**Sobre a fonte**: a primeira versão tentou embarcar Open Sans via
`Font("font/xxx.ttf", peso)` (caminho de classpath) — API que existia em
versões anteriores do Compose Multiplatform, mas foi removida/substituída
na 1.11 pelo novo sistema de "Compose Resources" (`Res.font.xxx`, gerado a
partir de uma pasta `composeResources/font/`). Isso só foi descoberto
porque o CI (rodando de verdade num Windows) recusou compilar — não havia
como prever isso sem compilar contra essa versão exata. Migrar para o
sistema novo de recursos ficou fora do escopo desta entrega; por ora o
desktop usa a fonte padrão do sistema, mantendo a mesma escala de
tamanhos/pesos do Android.

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

`GetNextDrawInfoUseCase` e `CaixaLotteryApi` (a busca do próximo concurso)
foram movidos de `:app` para `:shared` nesta fase: são Kotlin/JVM puro
(`java.net.HttpURLConnection`, `kotlinx.serialization`, `java.time`), sem
nenhum import Android — a mesma constatação que permitiu a extração do
domínio na fase anterior. Isso não muda a decisão de não ter banco: o
próximo concurso é buscado ao vivo (sem cache local) toda vez que a tela do
Volante troca de loteria, e a verificação em segundo plano (ver "Bandeja do
sistema" abaixo) guarda só o último número de concurso já notificado, via
`DesktopPreferences` — não o histórico de sorteios em si.

## Bandeja do sistema (Tray) e notificações

O app roda com um ícone na bandeja (`Tray` do Compose Desktop,
`compose.desktop.currentOs` já traz esse suporte — nenhuma dependência
nova) com o menu **Abrir**, **Ver próximo concurso** e **Sair**. Fechar a
janela (botão X) só a esconde — o processo continua rodando na bandeja; só
"Sair" do menu (ou `exitApplication`) encerra de verdade.

Uma corrotina em `application { }` ([Main.kt](../desktop/src/main/kotlin/com/volanteplus/desktop/Main.kt))
verifica a cada 30 minutos (`NEXT_DRAW_CHECK_INTERVAL_MS`) se há um
concurso novo para Mega-Sena e +Milionária, via
[`DetectNewContestUseCase`](../shared/src/commonMain/kotlin/com/volanteplus/loterias/domain/usecase/DetectNewContestUseCase.kt)
(`:shared`, pura o bastante para não precisar de `expect`/`actual`) +
[`NextDrawNotifier`](../desktop/src/main/kotlin/com/volanteplus/desktop/notification/NextDrawNotifier.kt)
(desktop, só a parte de onde persistir o "último conhecido" — em
`DesktopPreferences`). Quando o número de concurso muda, dispara uma
notificação nativa via `TrayState.sendNotification(Notification(...))`.

O ícone da bandeja é um PNG 32×32 separado do `.ico` do instalador
(`ImageIO`, usado para carregá-lo como `Painter` via
`toComposeImageBitmap()`, não decodifica `.ico` sem um plugin extra).

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl+G` | Gera jogos com o lote atual (só na tela Volante) |
| `Ctrl+B` | Vai para a tela de Backtesting |
| `F11` | Alterna tela cheia (`WindowState.placement`) |

Implementados via `onPreviewKeyEvent` do próprio `Window` (Compose
Desktop) — funcionam com a janela em foco, independente de qual elemento
interno está focado.

## Ajustes de UX

- **Redimensionável, tamanho mínimo 600×400**: `Window` já é redimensionável
  por padrão; o mínimo é aplicado ao `ComposeWindow` de baixo (AWT) via
  `window.minimumSize = Dimension(600, 400)` dentro do conteúdo do `Window`
  — não existe essa opção diretamente na API do Compose Desktop.
- **Tela cheia (F11)**: alterna `windowState.placement` entre
  `WindowPlacement.Fullscreen` e `WindowPlacement.Floating`.
- **Scroll do mouse nos jogos gerados**: já funciona sem nenhum código
  extra — `LazyVerticalGrid`/`LazyColumn` do Compose Desktop respondem a
  scroll de mouse nativamente (diferença de plataforma que o próprio
  framework resolve; não havia nada a implementar aqui).
- **Tooltips**: `TooltipArea` (`@OptIn(ExperimentalFoundationApi::class)`,
  API desktop-only do Compose Foundation) nos botões "Gerar jogos" (Volante),
  "Importar CSV" e "Usar estes dados para gerar jogos" (Backtesting).

## Preferências e tema

`DesktopPreferences` ([prefs/DesktopPreferences.kt](../desktop/src/main/kotlin/com/volanteplus/desktop/prefs/DesktopPreferences.kt))
usa `java.util.prefs.Preferences` (registro do Windows por baixo; não é
Room nem DataStore — não há lógica de domínio aqui, só leitura/escrita de
valores simples, então ficou só no `:desktop`, sem `expect`/`actual`) para
persistir: última loteria selecionada, escolha explícita de tema
claro/escuro, tamanho da janela e o último concurso já notificado por
loteria.

O tema segue esta prioridade: **escolha explícita do usuário** (botão de
alternância no topo da janela) vem antes do **tema do Windows**, detectado
uma vez no início via `reg query` sobre
`HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`
(`AppsUseLightTheme`) — API de processo do próprio JDK
(`ProcessBuilder`/`java.lang.Process`), sem JNA/JNI nem dependência nova,
ver [theme/WindowsTheme.kt](../desktop/src/main/kotlin/com/volanteplus/desktop/theme/WindowsTheme.kt)
—, que por sua vez vem antes do fallback `isSystemInDarkTheme()` do próprio
Compose (fora do Windows, ou se a leitura do registro falhar). A detecção
do tema do Windows roda uma vez no início (não há um "hook" de mudança de
tema em tempo real sem APIs nativas adicionais — clicar no botão de
alternância sempre resolve, mesmo que o usuário troque o tema do Windows
com o app já aberto).

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
código-fonte do Compose Multiplatform antes de cada push (assinaturas de
`rememberWindowState`, `Window(onPreviewKeyEvent = ...)`), mas **a primeira
compilação de verdade só acontece no CI**
(`.github/workflows/desktop-ci.yml` e `android-ci.yml`, que rodam em
runners do GitHub sem essa restrição) — e foi o CI, não a revisão manual,
que pegou dois problemas reais: a versão mínima do Kotlin exigida pelo
plugin `org.jetbrains.compose` (documentação indicava 2.1.0, o plugin
exige 2.2.0) e a API de carregamento de fonte por caminho de string
(removida na versão 1.11, ver nota acima). Rode localmente antes de
confiar cegamente nesta entrega.

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

### Versão

`nativeDistributions.packageVersion` lê `app.version` de `gradle.properties`
(hoje `1.1.0`) em vez de um valor fixo no `build.gradle.kts` — versão do
instalador desktop, com seu próprio ciclo, independente do `versionName` do
Android e do semver do site/PWA.

### Assinatura de código (Authenticode)

O plugin do Compose Desktop só assina nativamente no **macOS**
(`nativeDistributions.macOS { signing { ... } }`); no Windows, `jpackage`
não assina o instalador — é uma limitação real da ferramenta, não algo que
faltou configurar. A assinatura Authenticode roda como um passo à parte no
`desktop-ci.yml`, via `signtool.exe` (já vem no Windows SDK do runner
`windows-latest` — nenhuma dependência nova como Jsign foi adicionada, por
já haver `signtool` disponível de graça no ambiente de CI):

```powershell
signtool sign /f codesign.pfx /p <senha> /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 VolantePlus.msi
```

Esse passo só executa se os secrets `WINDOWS_CODESIGN_PFX_BASE64` (o
certificado `.pfx` codificado em base64) e `WINDOWS_CODESIGN_PFX_PASSWORD`
estiverem configurados no repositório — **este projeto ainda não tem
nenhum certificado real**; sem os secrets, o instalador sai sem assinatura
(como sempre foi) e o resto do workflow segue normal. Para habilitar:

1. Obtenha um certificado de assinatura de código (Authenticode) de uma CA
   reconhecida — um certificado comum ainda dispara o aviso do
   SmartScreen ("editor desconhecido") até acumular reputação; um
   certificado **EV** evita isso desde o primeiro download, mas custa mais
   e exige hardware token/HSM.
2. Codifique o `.pfx` em base64 (`certutil -encode cert.pfx cert.b64` no
   Windows, ou `base64 -w0 cert.pfx` no Linux/macOS) e cole o conteúdo no
   secret `WINDOWS_CODESIGN_PFX_BASE64` do repositório (Settings → Secrets
   and variables → Actions).
3. Coloque a senha do `.pfx` em `WINDOWS_CODESIGN_PFX_PASSWORD`.
4. O próximo push que rodar `desktop-ci.yml` já assina `.msi` e `.exe`
   automaticamente.

O mesmo certificado assina o `.msix` gerado manualmente (seção abaixo) —
rode o mesmo comando `signtool sign` sobre o `.msix` depois de convertê-lo.
Para publicação na Microsoft Store, note que a identidade do certificado
precisa bater com o "Publisher" registrado no Partner Center — um detalhe
que só se resolve no cadastro da loja, fora do escopo deste repositório.

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
atalhos Ctrl+G/Ctrl+B/F11 funcionam, e a desinstalação via "Aplicativos e
recursos" remove tudo. Esse passo é manual — não há como automatizar teste
de instalador em VM a partir deste repositório.

Enquanto estiver na VM, vale também conferir manualmente (nenhum destes
itens é automatizável neste repositório: exigem uma sessão gráfica
Windows real, não um runner de CI):

- **Resoluções**: 1366×768, 1920×1080 e uma tela 4K com escala do Windows
  em 150%/200% — o layout é todo Compose (dp-based), então deve escalar
  sem cortes; o tamanho mínimo (600×400) e o F11 (tela cheia) são os
  pontos mais sensíveis a testar em cada uma.
- **Temas do Windows**: claro, escuro e "Alto contraste" — os dois
  primeiros são cobertos pela detecção automática (`detectWindowsDarkTheme`)
  e pelo botão de alternância; alto contraste não tem tratamento
  específico neste app (seria um tema Material3 dedicado, fora do escopo
  desta entrega) — confirme ao menos que o texto continua legível.
- **Bandeja**: minimizar para a bandeja, fechar de fato pelo menu "Sair",
  e observar uma notificação real (pode forçar reduzindo
  `NEXT_DRAW_CHECK_INTERVAL_MS` temporariamente para testar sem esperar 30
  minutos).

## Ícone

`desktop/src/main/resources/icon.ico` (16/32/48/256px) foi gerado a partir
do mesmo ícone-placeholder usado no PWA e na extensão de navegador (não
existe nenhum ícone de marca próprio no projeto Android ainda — ver
`docs/MICROSOFT_STORE.md`). Troque por um ícone definitivo assim que
houver um.
