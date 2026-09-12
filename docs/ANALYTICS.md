# Plausible Analytics

Volante+ usa **Plausible Analytics** — uma alternativa privacy-first ao Google Analytics que não requer cookie banners em muitas jurisdições (GDPR-friendly por padrão).

## Setup

### 1. Criar conta no Plausible

1. Acesse [plausible.io](https://plausible.io)
2. Crie uma conta (gratuita para sites pequenos, com limite de eventos/mês)
3. Registre seu domínio (ex.: `volante.plus`)
4. Copie o **domain** da dashboard (ex.: `volante.plus`)

### 2. Configurar variáveis de ambiente

No `web/.env.local` (ou em CI/CD):

```bash
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=volante.plus
NEXT_PUBLIC_PLAUSIBLE_API_HOST=https://plausible.io/js/script.js
```

- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`: seu domínio no Plausible (deixar vazio desativa)
- `NEXT_PUBLIC_PLAUSIBLE_API_HOST`: URL do script (padrão: `plausible.io`, suporta self-hosted)

### 3. Verificar no navegador

1. Build e deploy da aplicação
2. Abra a dashboard do Plausible
3. Dentro de 1-2 minutos, você deverá ver tráfego começando a chegar

## Eventos rastreados

Volante+ rastreia automaticamente:

| Evento | Propriedades | Quando |
|--------|-------------|--------|
| `lottery_selection` | `lottery` | Usuário muda de loteria (Mega-Sena ↔ +Milionária) |
| `backtest_analysis` | `lottery`, `source` | Performance cache carregado (cached/manual/auto/seed) |
| `backtest_data_usage` | `lottery`, `data_source` | Dados de backtesting usados em geração (cached/worker-computed) |
| `game_generation` | `lottery`, `batch_size` | Jogos gerados com sucesso |

### Fontes de backtest (`source`)

- `cached`: Resultado já estava em cache (IndexedDB ou chrome.storage.local)
- `auto`: Recompilado automaticamente pelo Web Worker
- `manual`: Usuário rodou um backtesting explícito (se implementado futuramente)
- `seed`: Dados offline iniciais (seed)

### Fontes de dados (`data_source`)

- `cached`: Performance vinha de cache (salvo anteriormente)
- `worker-computed`: Acabou de ser calculado pelo Web Worker

## Dashboard & Relatórios

### Visualizações principais

1. **Sessões por país/região** — onde estão seus usuários
2. **Eventos por página** — que telas eles usam mais
3. **Funil de eventos** — usuários que selecionam loteria → geram jogos (taxa de conversão)
4. **Tendências temporais** — picos de uso por dia/hora

### Relatório de análise

Clique em **Analytics** → **Custom Report** para:

- **Lottery selection trends**: qual loteria é mais usada (Mega-Sena vs +Milionária)
- **Game generation per session**: quantos lotes em média o usuário gera por sessão
- **Backtest source distribution**: % de cache hits vs recomputação
- **Performance over time**: comparar taxa de geração antes/depois de mudanças

## Exemplo: Detectar degradação de performance

Se você notar que a taxa de `game_generation` cai:

1. Vá para **Events** → Filter by `game_generation`
2. Adicione dimensão `device` (desktop/mobile)
3. Analise: a queda é em mobile? Em navegadores específicos?
4. Cruze com commit history para identificar quando começou

## Self-hosted Plausible

Se preferir manter dados em servidor próprio:

1. Deploy self-hosted do Plausible (Docker, Vercel, etc.)
2. Configure o `NEXT_PUBLIC_PLAUSIBLE_API_HOST` apontando para seu servidor
3. Exemplo: `NEXT_PUBLIC_PLAUSIBLE_API_HOST=https://analytics.seudominio.com/js/script.js`

## Privacy & Compliance

Plausible é automaticamente GDPR/CCPA compliant:

- ✅ Sem cookies persistentes
- ✅ Sem identificação de usuários (IP não é armazenado)
- ✅ Sem rastreamento cross-site
- ✅ Sem dependência de consentimento em maioria das jurisdições

**Política de Privacidade**: você ainda precisa mencionar que usa analytics, mas não precisa de banner de cookies (a menos que use outras ferramentas que exijam).

## Extensão (Browser Extension)

A extensão está em `extension/popup-app/` e não carrega Plausible porque:

1. CSP da extensão é `script-src 'self'` (sem exceções para CDN externo)
2. Dados da extensão são menos críticos (só seleção de loteria + geração no popup)

Se quiser rastrear a extensão, seria necessário:
- Usar `chrome.runtime.sendMessage` para comunicar com um background script que faria o POST para Plausible
- Ou aceitar a limitação e rastrear apenas no web app

## Leitura recomendada

- [Plausible Analytics Docs](https://plausible.io/docs)
- [Custom events guide](https://plausible.io/docs/custom-event-goals)
- [Privacy policy template](https://plausible.io/privacy-focused-web-analytics)
