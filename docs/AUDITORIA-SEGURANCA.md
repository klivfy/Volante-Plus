# Auditoria de segurança — Volante-Plus

**Data:** 2026-11-04 · **Escopo:** web (Next.js 16 PWA), extensão (MV3 + popup
Next), desktop (Compose/Kotlin), backend de push, workflows de CI, dependências
e configuração de headers. **Método:** `npm audit` (npm 10 e 11, prod e full),
varredura de segredos, greps de padrões perigosos, inspeção manual das
superfícies (rotas de API, worker, SW, manifests), verificação de headers
servidos no build de produção e cruzamento com os avisos públicos da Next.js
(agosto–outubro 2026).

## 1. Resumo executivo

| Achado | Severidade | Estado |
| --- | --- | --- |
| `next` 16.2.12 — 5 avisos de RCE/DoS (ago–out/2026) | **Crítico** | **Corrigido** → 16.4.5 |
| `@sentry/nextjs` ≤10.76.1 (cadeia `glob` do bundler plugin) | Crítico | **Corrigido** → 10.78.0 |
| Transitivos com fix: `nanoid`, `source-map-js`, `brace-expansion`, `fast-uri` | Alto | **Corrigidos** |
| `extension/popup-app` com o mesmo `next` 16.2.12 + `nanoid` | Crítico | **Corrigido** (audit 0/0) |
| `lighthouse-gate.yml` sem bloco `permissions:` (default read/write) | Hardening | **Corrigido** (`contents: read`) |
| Cadeia build-time do Workbox (`serialize-javascript` HIGH, `ejs`, `jake`, `filelist`, `minimatch`, `deepmerge`) | Alto/moderado | **Aceito e documentado** (sem fix upstream; nunca executa em runtime) |

Resultado final: **0 vulnerabilidades de runtime conhecidas**; as restantes
(16 na árvore de build do web, todas `fix=False`) pertencem ao toolchain de
geração do service worker e ao plugin do Sentry, não chegam ao cliente nem ao
servidor em produção. `extension` e `extension/popup-app`: **0/0**.

> **Atualização (mesma data) — pentest:** uma camada adicional de testes de
> intrusão com ataque real à infraestrutura local (`next start` de produção)
> encontrou e corrigiu 8 falhas de defesa que a análise estática não pega
> (spoof de `X-Forwarded-For` contra o rate limit, falta de limite na rota
> `send`, porta livre na allowlist SSRF, source maps do PWA públicos,
> escapes de parser em `sameOriginPath`, `Promise.all` ilimitado no envio,
> comparação não timing-safe do `auth`, `X-Powered-By`) e fixou 5
> dependências (`vitest` 4.1.12, `vite` 8.3.5, `js-yaml` 4.3.2, `zod` 4.6.7 —
> audit 35→30, high 4→1; prod-only segue 16, mesma cadeia aceita). Detalhes,
> evidências e re-ataque de verificação (9/9): **`PENTEST-2026-11-04.md`**.

## 2. Achados corrigidos

### 2.1 `next` 16.2.12 → 16.4.5 (web e popup-app) — Crítico

Cinco avisos públicos da Next.js afetavam o pin exato:

| Aviso | Vetor | Aplicável a este app? |
| --- | --- | --- |
| GHSA-2xp9-vwfh-vxw4 / GHSA-g89c-p67h-r497 (ago/26) | RCE não autenticado via AVIF no otimizador de imagens (libheif/sharp) | **Não acionável**: o app não usa `next/image` (0 ocorrências) e não configura `remotePatterns`; a partir do upgrade, `sharp` ≥ 0.35.5 também elimina a classe |
| CVE-2026-75604 (ago/26) | RCE em servidores com filesystem Windows (Pages+App Router) | **Não aplicável**: deploy é Linux (Vercel); o upgrade elimina de qualquer forma |
| GHSA-vcvr-r3jv-pc5j (set/26) | RCE em `ImageResponse` de `next/og` | **Não aplicável**: 0 usos de `next/og`/`ImageResponse` |
| CVE-2026-96889 / GHSA-2464-fhr4-w9xw (out/26) | RCE no otimizador de imagens via SVG (librsvg) | **Não acionável** (sem `next/image`); mitigação upstream `sharp` ≥ 0.35.5 agora presente |
| GHSA-673q-mjm6-r5xr (out/26) | RCE em `use cache` retornando typed arrays | **Não aplicável**: 0 usos de `use cache` |
| GHSA-p3m5-59mp-jv5r (out/26) | DoS por CPU em Server Actions | **Não aplicável**: 0 usos de `"use server"` |

Mesmo sem vetor acionável, o upgrade foi feito porque elimina a classe
inteira de defeitos e cobre o SSRF de imagem (CVE-2026-94483, set/26) e os
defeitos de cache das releases intermediárias. Efeitos colaterais do bump:
`postcss` 8.5.25 (fora do range de XSS/file-read, GHSA de out/26) e
`sharp` 0.35.5. **Validação:** 758/758 testes unitários, `tsc --noEmit`,
`eslint`, `next build --webpack` (pipeline do next-pwa) e `npm ci` sob npm 10
e npm 11 — todos verdes.

### 2.2 `@sentry/nextjs` 10.69.0 → 10.78.0 — Crítico (cadeia)

O advisory contra `@sentry/nextjs ≤10.76.1` vem do `glob` vulnerável
embutido no `@sentry/bundler-plugin-core` (usado só para upload de source
maps no build). O bump traz `brace-expansion` 5.0.12 e `glob` fora dos
ranges afetados no subgrafo do Sentry.

### 2.3 Transitivos corrigidos via `npm update --package-lock-only`

`nanoid` 3.3.16→3.3.20 (loop infinito em gerador customizado),
`source-map-js` 1.2.1→1.2.2 (DoS de event-loop),
`fast-uri` 3.1.4→3.1.9 (host confusion por backslash),
`brace-expansion` 1.1.18/5.0.9→5.0.12 (DoS de CPU).
Todos dentro dos ranges já declarados — nenhum pin quebrado; pins
principais preservados (react 19.2.4, MUI 9.2.0, vitest 4.1.10,
playwright 1.62.1, next 16.4.5).

### 2.4 `extension/popup-app` — Crítico

O popup da extensão é um app Next com o mesmo pin 16.2.12. Corrigido para
16.4.5 + `nanoid` 3.3.20 + `source-map-js` 1.2.2. `npm audit` final:
**0 vulnerabilidades (prod e full)**.

### 2.5 Hardening de workflow

`lighthouse-gate.yml` não declarava `permissions:` — o GITHUB_TOKEN herdaria
o default do repositório (read/write). Adicionado `permissions:
contents: read` (o job não usa o token; least-privilege explícito). Os
outros 6 workflows já eram least-privilege e não usam `pull_request_target`
nem interpolam `${{ github.* }}` em shell.

## 3. Risco aceito e monitorado — toolchain de build

O `next-pwa`/`workbox-build` puxa `@rollup/plugin-terser → serialize-javascript
6.0.2` (HIGH: RCE teórico via `RegExp.flags`/`Date.toISOString` e DoS de CPU),
`ejs`/`jake`/`filelist`/`minimatch`/`deepmerge` (moderados) e o plugin do
Sentry mantém `glob` 13.x (moderado). Características que sustentam a
aceitação:

1. **Execução**: apenas durante `next build --webpack` (geração do
   `sw.js`), em runner de CI ou máquina do desenvolvedor — nunca no servidor
   de produção nem no cliente.
2. **Entrada**: os processos serializam dados do próprio build; não há
   entrada de atacante no fluxo do `serialize-javascript`.
3. **Upstream**: `fix=False` — nenhuma versão do workbox/next-pwa resolve
   hoje. O caminho de saída é a evolução do `next-pwa`/Workbox; reavaliar a
   cada upgrade.

`npm audit --omit=dev` pós-correções: 16 itens, todos nesta classe
build-time; runtime: **0**.

## 4. Verificações confirmadas (sem achado)

- **Headers de produção** (verificados com `curl` no `next start`):
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` restritiva, `HSTS` 2 anos + includeSubDomains e
  `CSP: frame-ancestors 'none'; base-uri 'self'; object-src 'none';
  form-action 'self'; script-src 'self' 'unsafe-inline' <plausible>`.
  Sem `default-src`/`connect-src` por decisão documentada (API da Caixa e
  ingest do Sentry variam por deploy). Nota honesta: `style-src` não é
  restringido (MUI/emotion exigem estilos inline).
- **Rotas de push** (`/api/push/subscribe`, `/api/push/send`): allowlist de
  hosts de push (anti-SSRF), teto de corpo (16 KB) validado no bytes real,
  rate limit por IP com teto de memória, segredo de envio com comparação em
  tempo constante (`timingSafeEqual`), rota `send` **fail-closed** (503 sem
  `PUSH_SEND_SECRET`), destino de clique normalizado para caminho same-origin
  (anti-phishing via notificação), DELETE exige `keys.auth` da inscrição.
- **Segredos**: nenhum token/chave versionado; único `.env` no repositório é
  `web/.env.example` com valores vazios e documentação de cada variável.
- **Padrões perigosos**: zero ocorrências de `dangerouslySetInnerHTML`,
  `innerHTML =`, `eval(`, `new Function(`, `document.write`,
  `target="_blank"` sem `rel`, `href="javascript:"`, `window.open` em
  código de produção (web, extensão, desktop).
- **Service worker / worker**: precache same-origin; handler de push usa
  `sameOriginPath`; `clients.openWindow` só com caminho do próprio app.
- **Extensão MV3**: permissões mínimas (`storage`, `alarms`), sem
  `externally_connectable` (nenhum site pode mandar mensagem para ela),
  `host_permissions` restritos às 3 APIs de loterias.
- **Desktop (Compose/Kotlin)**: única execução de processo é `reg query`
  com comando e caminho de registro fixos (sem input do usuário), com
  timeout e fallback.

## 5. Metodologia e reprodução

```bash
# Dependências (web; repetir em extension/ e extension/popup-app/)
npm audit --omit=dev && npm audit          # separa runtime de build-time
npm ls <pacote>                            # cadeia de quem puxa o vulnerável

# Locks (armadilha do ambiente: npm dentro de web/ detecta workspace root —
# gerar em cópia isolada e com npm 10, a versão dos runners de CI)
cp web/package.json /tmp/iso/ && cd /tmp/iso
npx -y npm@10 install --package-lock-only && npx -y npm@10 ci

# Headers servidos (build de produção)
npx next build --webpack && npx next start -p 3000
curl -sI http://localhost:3000/ | grep -iE "content-security|strict-transport"

# Superfícies
rg -n "dangerouslySetInnerHTML|eval\(|new Function\(" web/src extension/src
rg -n "ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN .*PRIVATE" . --hidden
```

## 6. Recomendações contínuas

1. **Gate de dependências no CI**: um job `npm audit --omit=dev
   --audit-level=high` no `web-ci.yml` (com baseline dos 16 aceitos) para
   que vulnerabilidades novas de runtime quebrem o PR — o que hoje depende
   de auditorias manuais como esta.
2. **Pin de `next`**: manter pin exato (16.4.5) e acompanhar as releases de
   segurança da Next.js (o ciclo 2026 foi de ~1 release/mês) — o upgrade
   desta auditoria cobriu 5 avisos de uma vez.
3. **Reavaliar a cadeia Workbox** a cada upgrade do `next-pwa`; quando o
   `workbox-build` soltar `serialize-javascript` ≥ 7.2, o HIGH restante cai.
4. **`sharp`**: mesmo sem `next/image`, o binário vem com o Next; manter
   ≥ 0.35.5 (hoje) e acompanhar advisories de libvips/libheif/librsvg.
5. Revogar tokens de deploy/push usados pontualmente (prática já adotada
   nas sessões anteriores).
