# Extensão de navegador

`extension/` contém uma extensão companion para Chrome, Edge e Firefox — ela
**não** empacota o app inteiro dentro da extensão. O que ela faz:

- Ícone na barra de ferramentas com um popup: botão "Abrir Volante+" que abre
  a sua instância do app (web) numa aba nova.
- Página de opções onde você configura a URL dessa instância (não vem
  nenhuma URL pré-configurada — ver [Por que não vem uma URL pronta](#por-que-não-vem-uma-url-pronta)).

Se no futuro fizer sentido embutir o app inteiro na extensão (páginas
offline, sem depender de abrir uma aba), isso é um projeto à parte — mudaria
o manifest (permissões, CSP) e provavelmente o próprio Next.js (export
estático). O que existe hoje é deliberadamente mínimo.

## Por que não vem uma URL pronta

A extensão não teria como saber, em tempo de build, se você hospeda o
Volante+ na Vercel, em outro provedor, ou localmente. Configure em
**Opções da extensão** a URL onde o seu Volante+ está publicado (ex.: o
domínio do seu deploy na Vercel — veja `docs/WEB.md#deploy`) ou
`http://localhost:3000` para testar contra o servidor de desenvolvimento.

## Build

```bash
node extension/build.mjs
```

Gera `extension/dist/{chrome,edge,firefox}.zip` — cada um com os arquivos
compartilhados de `extension/shared/` mais o `manifest.json` específico do
navegador (`extension/manifests/`). Chrome e Edge usam o mesmo manifest
(Manifest V3, ambos baseados em Chromium); Firefox tem o seu próprio, com o
campo `browser_specific_settings.gecko.id` que o Chrome/Edge não usam.

## Carregar sem publicar (modo desenvolvedor)

Útil para testar antes de submeter à loja, ou para uso pessoal sem publicar.

### Chrome

1. Rode `node extension/build.mjs` (ou aponte direto para `extension/dist/chrome/`,
   sem precisar do zip).
2. Acesse `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione `extension/dist/chrome/`.

### Edge

1. Mesmo build (`extension/dist/edge/` — conteúdo idêntico ao do Chrome).
2. Acesse `edge://extensions`.
3. Ative **Modo de desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione `extension/dist/edge/`.

### Firefox

Firefox exige que a extensão esteja assinada para instalação permanente, mas
aceita carregamento temporário (até fechar o navegador) sem assinatura:

1. Acesse `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária**.
3. Selecione qualquer arquivo dentro de `extension/dist/firefox/` (ex.:
   `manifest.json`) — o Firefox carrega a pasta inteira a partir dele.

## Publicar nas lojas

### Chrome Web Store

1. Crie/acesse uma conta de desenvolvedor no
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (taxa única de cadastro cobrada pelo Google).
2. **Add new item** → envie `extension/dist/chrome.zip`.
3. Preencha ficha da loja (descrição, categoria, screenshots, ícone
   promocional) e política de privacidade — obrigatória mesmo para extensões
   que não coletam dados (declare isso explicitamente no formulário).
4. Envie para revisão. O Google audita permissões pedidas (`storage`) — como
   a extensão só abre uma aba e guarda uma URL, a justificativa é direta.

### Microsoft Edge Add-ons

1. Crie/acesse uma conta no
   [Partner Center — Extensões do Microsoft Edge](https://partner.microsoft.com/dashboard/microsoftedge/overview)
   (sem taxa de cadastro).
2. **Criar nova extensão** → envie `extension/dist/edge.zip`.
3. Mesma ficha de loja (descrição, categoria, screenshots, privacidade).
4. Enviar para certificação. A Microsoft aceita o mesmo pacote Manifest V3
   usado no Chrome sem alterações — é por isso que os dois manifests são
   idênticos aqui.

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
