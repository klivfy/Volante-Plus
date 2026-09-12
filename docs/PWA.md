# Volante+ como PWA

O Volante+ web é um Progressive Web App: pode ser instalado e usado como app
"nativo" (ícone na tela inicial, janela própria, sem barra de endereço) e
continua funcionando sem rede depois da primeira visita.

## Instalação

**Android (Chrome) / Desktop (Chrome, Edge):**

1. Abra o Volante+ no navegador.
2. Toque/clique no ícone de instalação (⊕ ou "Instalar app") na barra de
   endereço, ou no menu do navegador → "Instalar Volante+".
3. Confirme. O app passa a abrir como janela própria e ganha um ícone na
   tela inicial/menu de apps.

**Sem esse ícone aparecer:** o navegador só oferece a instalação quando o
manifest e o service worker carregaram com sucesso (ver
[Verificando a instalação](#verificando-a-instalação)) — normalmente aparece
depois de navegar por uma ou duas páginas do app.

## O que funciona offline

Depois de uma primeira visita online (que baixa e ativa o service worker):

- **Abrir o app** — a interface carrega inteira do cache, sem precisar de rede.
- **Gerar jogos** — toda a geração roda no navegador (`engine/`), sem chamada
  de rede alguma. Funciona offline mesmo na primeira visita.
- **Backtesting** — roda sobre o histórico já salvo no IndexedDB
  (`services/db.ts`), local ao navegador — não depende de rede.
- **Copiar/compartilhar jogo** — funcionalidades do próprio navegador, não
  fazem rede.

## O que não funciona offline

- **Card do próximo concurso** (data e prêmio estimado) — depende da API
  pública de terceiros (`caixaApi.ts`). Sem rede, o card mostra
  "Não foi possível carregar os dados do próximo concurso. Verifique sua
  conexão." em vez de travar ou mostrar dado desatualizado como se fosse atual.
- **Importar/atualizar histórico de concursos** — se a tela usada para isso
  também depender de rede, precisa de conexão na primeira vez; depois de
  salvo, o histórico já importado fica disponível offline normalmente.

## Estratégia de cache (service worker)

Implementado via [`@ducanh2912/next-pwa`](https://github.com/DuCanhGH/next-pwa)
(Workbox), configurado em `web/next.config.ts`:

| Tipo de recurso | Estratégia | Por quê |
|---|---|---|
| JS/CSS/fontes do build (`_next/static/...`) | Cache-first | Nomes de arquivo incluem hash do conteúdo — uma URL nunca muda de conteúdo, então não há necessidade de revalidar. |
| Imagens | Stale-while-revalidate | Serve do cache imediatamente, atualiza em segundo plano. |
| API da Caixa (próximo concurso) | Network-first (timeout 5s) | Prioriza dado atualizado; cai para o cache só se a rede falhar/demorar. |
| Página inicial (`start-url`) | Precache dedicado | Garante abertura offline mesmo na primeira sessão após instalar. |

## Verificando a instalação

Chrome/Edge → DevTools → aba **Application**:

- **Manifest**: deve mostrar nome, ícones (192×192 e 512×512) e cores sem erros.
- **Service Workers**: deve listar um worker com status "activated and is running".
- **Cache Storage**: deve haver caches como `workbox-precache-*`, `start-url`,
  `static-image-assets` etc. depois de navegar pelo app.

Para testar offline de verdade: DevTools → Application → Service Workers →
marque **Offline**, depois recarregue a página.

## Desenvolvimento

O service worker só é gerado no build de produção (`npm run build`, que usa
`--webpack` — ver `docs/WEB.md`). Em `npm run dev` (Turbopack) ele não roda,
então para testar qualquer coisa relacionada a PWA/offline é preciso:

```bash
npm run build
npm run start
```

## Handlers extras do service worker

O SW gerado pelo Workbox não cobre `push`, `notificationclick` nem
`periodicsync`. Esses handlers ficam em `web/src/worker/index.ts`, que o
`next-pwa` compila (`customWorkerSrc`) e injeta no `sw.js` via `importScripts`.
O arquivo `public/worker-*.js` é artefato de build (gitignored), como o
próprio `sw.js`.

## Notificações push (novos sorteios)

Fluxo completo de Web Push, todo best-effort (degrada sem suporte/permissão):

1. **Opt-in** — o botão "Ativar notificações" (`NotificationOptIn`, via
   `usePushNotifications`) pede permissão e inscreve o navegador no
   `PushManager` (`services/pushService.ts`), mandando a inscrição para
   `POST /api/push/subscribe`.
2. **Envio** — quando um novo sorteio é detectado, um `POST /api/push/send`
   (função serverless, protegida por `PUSH_SEND_SECRET`) dispara o push a todos
   os inscritos com `web-push`. Pensado para ser acionado por um **Vercel
   Cron** ou pelo sincronizador.
3. **Recebimento** — o handler `push` do worker mostra a notificação; o clique
   (`notificationclick`) foca/abre o app.
4. **Fallback com app aberto** — `showLocalNotification` mostra uma notificação
   local imediata, sem depender do servidor.

**Configuração (opcional).** Gere as chaves com `npx web-push
generate-vapid-keys` e preencha em `.env` (ver `.env.example`):
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` e `PUSH_SEND_SECRET`. Sem as chaves, o app funciona normalmente
— só o opt-in de push não aparece.

> **Persistência das inscrições.** O backend de exemplo
> (`src/server/pushStore.ts`) guarda as inscrições **em memória** — não
> sobrevive a cold starts nem é compartilhado entre instâncias serverless. Em
> produção, troque essa camada por um KV/DB real; a interface
> (`addSubscription`/`removeSubscription`/`sendToAll`) foi isolada para isso.

## Sincronização em segundo plano (Background Sync)

- **Periodic Background Sync** — quando o navegador suporta,
  `registerBackgroundSync` (`services/syncService.ts`) registra a tag
  `volante-plus-sync`. Ao disparar, o handler `periodicsync` do worker avisa as
  abas abertas (`postMessage`), que rodam a sincronização (`syncAndCountNew`) —
  a persistência real usa o IndexedDB via Dexie, que vive no contexto da
  página.
- **Fallback ao abrir o app** — `PwaLifecycle` chama `syncIfStale()` na
  montagem, cobrindo os casos sem suporte a Periodic Background Sync (ou com o
  app fechado por muito tempo). Só sincroniza se a última vez foi há mais de
  24h.
- **Badge do ícone** — havendo concursos novos após a sincronização,
  `services/badge.ts` atualiza o badge do PWA (`navigator.setAppBadge`) e uma
  notificação local avisa. O badge é limpo quando o usuário volta ao app.
