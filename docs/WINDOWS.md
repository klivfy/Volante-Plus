# Publicar o Volante+ Desktop na Microsoft Store (MSIX nativo)

Este documento cobre o app **nativo** Windows (`desktop/`, Compose
Multiplatform, empacotado como `.msix`) — diferente do fluxo de PWA já
documentado em [`docs/MICROSOFT_STORE.md`](MICROSOFT_STORE.md). Assim como
naquele fluxo, **a submissão à loja é manual**: nenhum passo de cadastro,
pagamento ou envio ao Partner Center roda automaticamente a partir deste
repositório ou do CI.

## 1. Build, assinatura e empacotamento (referência)

Todo o processo de compilar, empacotar (`.msi`/`.exe`) e assinar
(Authenticode via `signtool`) já está documentado em
[`docs/DESKTOP.md`](DESKTOP.md#empacotamento-windows-msi--exe) — este
arquivo não repete esse conteúdo, só referencia:

- Versão do instalador: `app.version` em `gradle.properties`.
- Assinatura: `signtool` no `desktop-ci.yml`, condicionada aos secrets
  `WINDOWS_CODESIGN_PFX_BASE64`/`WINDOWS_CODESIGN_PFX_PASSWORD`.
- Conversão `.msi` → `.msix`: MSIX Packaging Tool, processo manual (ver
  [`docs/DESKTOP.md#convertendo-para-msix-manual`](DESKTOP.md#convertendo-para-msix-manual)).
- UUID de upgrade fixo (`windows.upgradeUuid` em `desktop/build.gradle.kts`)
  — nunca trocar entre releases.

## 2. CI: release draft automático

`.github/workflows/desktop-ci.yml` builda e empacota `.msi`/`.exe` em todo
push/PR (job `build`, `windows-latest`). Ao empurrar uma tag no formato
**`vX.Y.Z-desktop`** (ex.: `v1.1.0-desktop`), um segundo job (`release`)
publica automaticamente esses instaladores como uma **Release do GitHub em
rascunho** (`--draft`) — não pública até alguém revisar e publicar
manualmente. Isso cobre a distribuição fora da loja (download direto); a
conversão para `.msix` e a submissão à Microsoft Store continuam
inteiramente manuais (seções 3–5).

```bash
git tag v1.1.0-desktop
git push origin v1.1.0-desktop
```

## 3. Assets de listagem

Diferente do PWA (que já tem screenshots reais gerados contra o app rodando
— ver `docs/MICROSOFT_STORE.md`), **este projeto ainda não tem capturas de
tela do app desktop nativo**: gerá-las exige uma sessão gráfica Windows de
verdade (o ambiente onde este repositório é desenvolvido não tem display,
só builda via CI). Antes de submeter, capture manualmente numa VM/máquina
Windows com o `.msi` instalado:

| Asset | Especificação | Como gerar |
|---|---|---|
| Screenshot principal | 1920×1080, PNG | Tela de Volante com jogos gerados, janela maximizada |
| Screenshot secundário | 1920×1080, PNG | Tela de Backtesting com um relatório carregado |
| Ícone da loja | 300×300, PNG | Derive de `desktop/src/main/resources/icon.ico` (mesmo ícone-placeholder do PWA/extensão — ver `docs/MICROSOFT_STORE.md`) |
| Banner promocional (opcional) | conforme o Partner Center pedir no momento da submissão | Composição simples com o ícone + slogan, se desejar |

**Nota**: assim como nos screenshots do PWA, prefira capturar contra dados
reais (ou pelo menos plausíveis) do próximo concurso — o card de "próximo
concurso" busca isso ao vivo via `GetNextDrawInfoUseCase`, então basta ter
conectividade no momento da captura.

## 4. Conteúdo da listagem

Mesmo texto usado na listagem do PWA (seção 5 de
[`docs/MICROSOFT_STORE.md`](MICROSOFT_STORE.md#5-conteúdo-da-listagem)),
com o diferencial de desempenho nativo destacado:

**Nome:** Volante+

**Categoria:** Utilitários e Ferramentas (ou "Finanças pessoais", conforme
disponível no questionário do Partner Center — qualquer uma das duas se
aplica ao app)

**Descrição curta:**
> Gerador estatístico para Mega-Sena e +Milionária. Sem palpite, sem número quente — agora como app nativo Windows, rápido e leve, sem precisar de navegador.

**Descrição completa:** a mesma da seção 5 de `docs/MICROSOFT_STORE.md`,
acrescentando um parágrafo final:

> Esta versão roda como aplicativo nativo do Windows — instalação via
> `.msi`/MSIX, ícone na bandeja do sistema com notificação automática de
> novo concurso, atalhos de teclado e desempenho nativo (sem overhead de
> navegador ou service worker).

**Palavras-chave:** as mesmas do PWA, mais: nativo, windows, offline, bandeja.

**Política de privacidade:** mesma URL já publicada para o PWA
(`https://SEU-PROJETO.vercel.app/privacy-policy.html`, ver
`docs/MICROSOFT_STORE.md#4-política-de-privacidade`) — o app desktop não
coleta dado pessoal algum, mesmo aviso se aplica.

## 5. Submissão no Partner Center (processo manual)

1. Acesse [partner.microsoft.com](https://partner.microsoft.com) — mesma
   conta de desenvolvedor já usada (ou criada) para o PWA, se aplicável;
   não há taxa adicional por ter mais de um app cadastrado.
2. **Criar novo app** → selecione o tipo de pacote **MSIX** (não PWA desta
   vez — a diferença fica só na etapa de tipo de pacote no assistente).
3. Faça upload do `.msix` assinado (seção 1) e dos assets da seção 3.
4. Preencha descrição, categoria e palavras-chave com o conteúdo da
   seção 4.
5. Informe a URL da política de privacidade (seção 4).
6. Submeta para revisão.

A revisão da Microsoft para apps MSIX costuma levar de 1 a 3 dias úteis,
igual ao fluxo de PWA. A identidade do certificado de assinatura
(Authenticode) precisa bater com o "Publisher" cadastrado no Partner
Center — normalmente resolvido associando o certificado à mesma conta no
momento da primeira submissão.

## 6. Checklist de atualização (nova versão → novo MSIX → resubmissão)

Para publicar uma atualização depois que o app já estiver na loja:

1. Suba `app.version` em `gradle.properties` (semver — a loja exige que a
   versão do pacote seja estritamente maior que a publicada).
2. **Não** troque `windows.upgradeUuid` em `desktop/build.gradle.kts`.
3. `git tag vX.Y.Z-desktop && git push origin vX.Y.Z-desktop` — o CI gera o
   Release draft com o novo `.msi`/`.exe` (seção 2).
4. Converta o novo `.msi` para `.msix` (seção 1 / `docs/DESKTOP.md`) e
   assine com o mesmo certificado.
5. No Partner Center, abra o app existente → **Atualizações do pacote** →
   envie o novo `.msix`.
6. Atualize o changelog da submissão com as notas da versão (reaproveite o
   texto do `CHANGELOG.md` deste repositório).
7. Submeta para revisão — não é preciso preencher a listagem de novo, só
   confirmar se algo mudou (screenshots, descrição).

## 7. Troubleshooting comum

| Sintoma | Causa provável | Solução |
|---|---|---|
| Instalador `.msi` não assina no CI (`signtool.exe não encontrado`) | Secrets de certificado não configurados, ou runner sem Windows SDK | Verifique `WINDOWS_CODESIGN_PFX_BASE64`/`WINDOWS_CODESIGN_PFX_PASSWORD` nos secrets do repositório (ver `docs/DESKTOP.md`); sem eles o passo é pulado de propósito, não é erro |
| Instalação existente vira uma segunda entrada em "Aplicativos e recursos" em vez de atualizar | `windows.upgradeUuid` foi trocado entre releases | Nunca altere esse valor; se já aconteceu, o usuário precisa desinstalar a versão antiga manualmente uma vez |
| Partner Center recusa o `.msix` por "Publisher mismatch" | O `Publisher` dentro do MSIX (definido na conversão) não bate com o cadastrado na conta do Partner Center | Refaça a conversão MSIX usando exatamente o `Publisher` mostrado no Partner Center (Configurações da conta) |
| SmartScreen mostra "Editor desconhecido" mesmo com o instalador assinado | Certificado de assinatura de código comum (não EV) ainda não acumulou reputação suficiente | Esperado — reputação cresce com downloads/tempo; um certificado **EV** evita esse aviso desde o primeiro download (ver `docs/DESKTOP.md`) |
| `gh release create` falha no job `release` do CI com "release already exists" | Tag `v*-desktop` reutilizada após a Release já ter sido publicada (não mais rascunho) | O passo já trata o caso de rascunho existente (`gh release upload --clobber`); se a Release foi publicada manualmente, apague-a ou use uma tag nova para a próxima versão |
| Release job não roda | Push não foi de uma tag `v*-desktop` (ex.: push comum na branch) | O job `release` só dispara com `github.ref_type == 'tag'` e o padrão de tag configurado em `on.push.tags`; confirme que a tag foi criada e empurrada, não só um commit normal |
