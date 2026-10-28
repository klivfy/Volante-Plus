# Extensão de navegador

`extension/` é uma extensão Manifest V3 para Chrome, Edge e Firefox que
embute a página Volante (versão simplificada: seleção de loteria + geração de
jogos) diretamente no popup da barra de ferramentas — sem depender de abrir
uma aba nem de ter o Volante+ web publicado em algum lugar.

- **Popup** (400×600) — a página Volante simplificada, gerada como export
  estático de um Next.js próprio (`extension/popup-app/`) e embutida na
  extensão. Lê o histórico e o desempenho das dezenas de `chrome.storage.local`
  (ou do seed offline, se a extensão ainda não sincronizou nada) e gera jogos
  com o mesmo motor (`web/src/engine/`) usado pelo app web.
- **Sincronização em segundo plano** — um service worker (`background.js`)
  agendado via `chrome.alarms` busca o histórico novo periodicamente (a cada
  24h) e grava em `chrome.storage.local`.
- **Badge no ícone** — havendo concursos novos após uma sincronização, o
  ícone da extensão ganha um badge com a contagem; abrir o popup limpa o
  badge.

## Por que não é o mesmo build do app web

O app web (`web/`) tem rotas de API (`/api/push/...`) que usam `POST`/`DELETE`
— export estático do Next.js (`output: "export"`) só suporta rotas `GET`, e a
extensão não roda um servidor Next.js. Por isso o popup é um projeto Next.js
**separado e mínimo** (`extension/popup-app/`), sem MUI nem as telas de
backtesting/notificações do app completo — só o necessário para gerar jogos
dentro de um popup de 400×600.

Esse popup reaproveita diretamente os módulos puros do app web via import
relativo (`../../../../web/src/engine/...`, `../../../../web/src/data/seed`) —
a mesma lógica de geração/backtesting, sem duplicar código. Isso exige
`experimental.externalDir: true` no `next.config.ts` do popup (por padrão o
webpack do Next recusa resolver imports que escapam da raiz do projeto).

**Pages Router, não App Router.** O export estático do App Router embute o
payload de hidratação em `<script>` **inline** (`self.__next_f.push(...)`,
protocolo de streaming RSC) — mas toda página de extensão MV3 tem uma CSP fixa
`script-src 'self'`, sem `unsafe-inline` e sem exceção possível via manifest
(Chrome rejeita/ignora qualquer tentativa de relaxar isso para scripts). Isso
quebra a hidratação silenciosamente (React cai em
`BAILOUT_TO_CLIENT_SIDE_RENDERING`) — confirmado testando o popup real dentro
de um Chromium com a extensão carregada via Playwright. O Pages Router, em
compensação, só usa `<script src="...">` externos mais um bloco
`__NEXT_DATA__` do tipo `application/json` (não é executado como script, então
a CSP não se aplica) — por isso `popup-app/src/pages/` usa Pages Router
(`_app.tsx` + `index.tsx`), não `src/app/`.

## Por que `chrome.storage.local` em vez de IndexedDB

O popup e o service worker de background são dois contextos de execução
separados que precisam ler/gravar o mesmo estado (histórico sincronizado,
badge). `chrome.storage.local` (via `extension/src/storage.ts`) é acessível
diretamente dos dois sem precisar abrir/gerenciar uma conexão de banco em
cada um, e sobrevive ao service worker MV3 sendo descartado entre eventos —
diferente de manter uma conexão Dexie/IndexedDB viva, que teria que ser
reaberta a cada acordar do worker.

## Estrutura

```
extension/
  manifests/{chrome,edge,firefox}.manifest.json  # um manifest por navegador
  popup-app/            # Next.js separado — vira o popup (export estático)
  shared/icons/          # ícones (16/32/48/128), compartilhados pelos 3 alvos
  src/
    storage.ts           # chrome.storage.local (histórico + performances cache)
    sync.ts               # busca histórico novo (reusa web/src/services/caixaApi.ts)
    background.ts         # service worker: chrome.alarms + badge
  build.mjs              # orquestra o build completo
```

## Build

```bash
cd extension && npm ci
cd popup-app && npm ci && cd ..

npm run build          # os três alvos (chrome, edge, firefox)
npm run build:chrome    # só um alvo — mais rápido para iterar
npm run build:edge
npm run build:firefox
```

Cada alvo gera `extension/dist/<target>/` (popup exportado na raiz +
`background.js` + `icons/` + `manifest.json` específico) e
`extension/dist/<target>.zip`. Chrome e Edge usam o mesmo manifest (Manifest
V3, Chromium, `background.service_worker`); Firefox tem o seu
(`background.scripts` em vez de `service_worker` — a versão mínima suportada
declarada aqui, `strict_min_version: 115.0`, é anterior ao suporte a
`service_worker` no Firefox; `browser_specific_settings.gecko.id` também é
exclusivo dele).

## webextension-polyfill

`chrome.*` (Chrome/Edge, baseado em callback) e `browser.*` (Firefox, Promises
nativas) diferem na API. `extension/src/*.ts` e
`popup-app/src/app/PopupContent.tsx` usam só `browser.*` do pacote
[`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill),
que expõe esse namespace com Promises em qualquer um dos três navegadores —
um único código-fonte para os três `build:*`, sem `if (chrome) ... else
browser...` espalhado pelo código.

**Detalhe do popup:** `webextension-polyfill` lança um erro imediatamente se
for importado fora de um contexto real de extensão — o que aconteceria
durante o prerender estático do `next build` (que roda o Client Component uma
vez no Node para gerar o HTML inicial). Por isso `page.tsx` só importa o
componente de verdade (`PopupContent`) via `next/dynamic(..., { ssr: false
})`: ele nunca é avaliado durante o build, só depois, já rodando no
navegador dentro da extensão.

## Carregar sem publicar (modo desenvolvedor)

### Chrome

1. `npm run build:chrome` (dentro de `extension/`).
2. Acesse `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione `extension/dist/chrome/`.

### Edge

1. `npm run build:edge`.
2. Acesse `edge://extensions`.
3. Ative **Modo de desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione `extension/dist/edge/`.

### Firefox

Firefox exige que a extensão esteja assinada para instalação permanente, mas
aceita carregamento temporário (até fechar o navegador) sem assinatura:

1. `npm run build:firefox`.
2. Acesse `about:debugging#/runtime/this-firefox`.
3. Clique em **Carregar extensão temporária**.
4. Selecione qualquer arquivo dentro de `extension/dist/firefox/` (ex.:
   `manifest.json`) — o Firefox carrega a pasta inteira a partir dele.

Em todos os três: clique no ícone da extensão na barra de ferramentas para
abrir o popup, escolha a loteria e gere jogos. A primeira abertura (sem
sincronização ainda) usa o seed offline (`web/src/data/seed/`) para calcular
o desempenho das dezenas.

### Validação automática

`npx web-ext lint --source-dir=extension/dist/<target> --self-hosted` roda a
mesma validação de manifest/permissões que a Mozilla aplica no AMO —
útil mesmo para os alvos Chrome/Edge como checagem geral de sanidade do
pacote. Os avisos `UNSAFE_VAR_ASSIGNMENT` sobre `innerHTML` vêm do runtime
minificado do próprio Next.js/React (hidratação), não de código deste
projeto — não bloqueiam publicação.

## Permissões pedidas

| Permissão | Por quê |
|---|---|
| `storage` | Guardar histórico sincronizado e desempenho cacheado (`chrome.storage.local`). |
| `alarms` | Agendar a sincronização recorrente em segundo plano. |
| `host_permissions` (`loteriascaixa-api.herokuapp.com`, `api.guidi.dev.br`, `servicebus2.caixa.gov.br`) | O service worker faz `fetch` direto às 3 fontes de dados oficiais/espelho do histórico — sem a permissão do host, o MV3 aplica CORS normal de página e a fonte falha silenciosamente (o sync degrada para as demais). |

## Publicar nas lojas

O processo de submissão em si não muda com esta reformulação — só o conteúdo
do pacote (`dist/<target>.zip`) e as permissões pedidas. Ao (re)enviar,
reveja a justificativa de permissões na ficha da loja: a extensão agora pede
`alarms` e `host_permissions` além de `storage`, e o popup passou a embutir
toda a lógica de geração (antes só abria uma aba).

### Chrome Web Store

1. Crie/acesse uma conta de desenvolvedor no
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (taxa única de cadastro cobrada pelo Google).
2. **Add new item** → envie `extension/dist/chrome.zip`.
3. Preencha ficha da loja (descrição, categoria, screenshots, ícone
   promocional) e política de privacidade — obrigatória mesmo para extensões
   que não coletam dados (declare isso explicitamente no formulário).
4. Envie para revisão.

### Microsoft Edge Add-ons

1. Crie/acesse uma conta no
   [Partner Center — Extensões do Microsoft Edge](https://partner.microsoft.com/dashboard/microsoftedge/overview)
   (sem taxa de cadastro).
2. **Criar nova extensão** → envie `extension/dist/edge.zip`.
3. Mesma ficha de loja (descrição, categoria, screenshots, privacidade).
4. Enviar para certificação. A Microsoft aceita o mesmo pacote Manifest V3
   usado no Chrome sem alterações — é por isso que os dois manifests são
   quase idênticos aqui (só o `name`/`description` compartilhados).

### Firefox Add-ons (addons.mozilla.org)

1. Crie/acesse uma conta no
   [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/).
2. **Submit a New Add-on** → envie `extension/dist/firefox.zip`.
3. Escolha distribuição **On this site** (listagem pública no AMO, com
   revisão da Mozilla) ou **On your own** (assinada pela Mozilla, mas
   distribuída por conta própria, sem listagem pública).
4. A Mozilla assina o pacote depois da revisão — só então ele pode ser
   instalado permanentemente (o carregamento "temporário" da seção anterior
   não precisa de assinatura, mas não sobrevive a reiniciar o navegador).

## Versionamento

O campo `version` nos três manifests (`extension/manifests/*.json`) segue o
mesmo número de versão do projeto (ver `README.md`, raiz do repositório).
Atualize os três junto com qualquer bump de versão.
