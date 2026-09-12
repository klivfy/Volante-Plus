# Sentry Error Tracking

Volante+ usa **Sentry** para capturar e monitorar erros em produção, ajudando a identificar e corrigir problemas rapidamente.

## Setup

### 1. Criar projeto no Sentry

1. Acesse [sentry.io](https://sentry.io) e crie uma conta (plano gratuito inclui 10K eventos/mês)
2. Crie um novo projeto com **Platform: Next.js**
3. Na página de setup, copie:
   - **DSN** (ex.: `https://abc123@o123.ingest.sentry.io/456`)
   - **Organization slug** (ex.: `my-org`)
   - **Project slug** (ex.: `volante-plus`)
   - **Auth Token** (gere em Settings → Auth Tokens)

### 2. Configurar variáveis de ambiente

No `web/.env.local` (ou CI/CD):

```bash
# Client-side (público) — usado no navegador
NEXT_PUBLIC_SENTRY_DSN=https://abc123@o123.ingest.sentry.io/456
NEXT_PUBLIC_APP_VERSION=2.0.0

# Server-side (secreto) — usado durante build para upload de source maps
SENTRY_ORG=my-org
SENTRY_PROJECT=volante-plus
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxxxxxxx
```

**Importante**: `SENTRY_AUTH_TOKEN` **nunca** deve ser exposto publicamente.

### 3. Build e deploy

Ao fazer `npm run build`:

1. Sentry CLI automaticamente processa source maps
2. Envia mappings ao Sentry (se `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` definidos)
3. JavaScript minificado em produção passa a ser desymbolizado automaticamente

Sem auth token válido, o build avisa mas continua — apenas sem source maps no Sentry.

### 4. Verificar no dashboard

1. Abra [sentry.io/organizations/seu-org/issues](https://sentry.io)
2. Trigger um erro manual (ex.: chame `reportError` numa ação)
3. Dentro de 1-2 segundos, erro deve aparecer no dashboard

## Erros capturados automaticamente

Sentry capture automaticamente:

- ✅ **Exceções não tratadas** em client-side
- ✅ **Erros de servidor** (API routes)
- ✅ **Erros de Next.js** (build, runtime)
- ✅ **Erros de JavaScript** não capturados por try-catch

## Erros capturados manualmente

Volante+ também registra erros específicos:

### Game Generation

```typescript
try {
  const batch = generateGames(lottery, batchCount, performances);
} catch (err) {
  reportUserError(err, {
    tags: { feature: 'game-generation', lottery }
  });
}
```

**Severidade**: `warning` (erro de usuário, não crítico)

### Backtest Analysis (Worker)

```typescript
try {
  const results = await analyzeBacktest(draws, lottery);
} catch (err) {
  reportWorkerError(err, {
    workerType: 'backtest',
    messageType: 'analysis'
  });
}
```

**Severidade**: `error` (backend computation falhou)

### IndexedDB (Database)

```typescript
try {
  await db.performances.put({ lottery, data });
} catch (err) {
  reportDbError(err, {
    table: 'performances',
    operation: 'put'
  });
}
```

**Severidade**: `error` (persistência falhou)

### API Routes

```typescript
export async function GET(req) {
  try {
    const data = await fetchFromCaixa();
    return Response.json(data);
  } catch (err) {
    reportApiError(err, 500, {
      endpoint: '/api/draws',
      method: 'GET'
    });
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

**Severidade**: `error` (5xx) ou `warning` (4xx)

## Níveis de severidade

| Nível | Quando usar | Exemplo |
|-------|------------|---------|
| `fatal` | Erro que quebra completamente a app | Falha ao inicializar Sentry |
| `error` | Erro inesperado, backend ou sistema | Worker crash, DB error, 500 |
| `warning` | Erro esperável, user action falhou | Validação, permission denied |
| `info` | Breadcrumb informativo | User clicked button |

## Dashboard & Alertas

### Issues (Problemas)

1. Agrupa erros idênticos por stack trace
2. Mostra **frequência** (quantas ocorrências por dia)
3. Tendência temporal (está piorando?)
4. **Affected users** (quantos usuários atingidos)

### Alertas

Configure alertas para:

- Issues novas
- Taxa de erro acima de X% de eventos
- Regressão (novo spike numa issue antiga)

**Exemplo**: 
```
Alert if: events with level >= error
Occurs: 10 times in 5 minutes
Do: Send to #alerts Slack channel
```

### Custom Reports

Crie relatórios personalizados:

1. **Backtest errors by lottery** — qual loteria tem mais problemas?
2. **Error rate trend** — estamos melhorando?
3. **Impact by browser** — qual navegador tem mais issues?

Clique em **Discover** → **Create Custom View** → salve.

## Browsing Errors

### Reproduzir um erro

1. Clique numa issue no dashboard
2. Veja:
   - **Stack trace** (qual função falhou)
   - **Breadcrumbs** (ações antes do erro)
   - **User context** (sistema operacional, navegador)
   - **Source maps** (linha exata do arquivo original, se uploaded)

### Filterizar issues

Use filtros avançados:

```
is:unresolved environment:production level:error
```

## Source Maps

Source maps permitem ver o código original (não minificado) no stack trace.

### Upload automático

Se `SENTRY_AUTH_TOKEN` estiver definido, `withSentryConfig` automaticamente:

1. Gera source maps durante `next build`
2. Envia ao Sentry
3. Remove source maps do bundle (produtor)

### Verificar upload

```bash
# Login no Sentry CLI
npx sentry-cli login

# Lista releases do projeto
npx sentry-cli releases list --org=my-org --project=volante-plus
```

## Telemetria & Privacy

### O que Sentry coleta

- Error stack traces
- User agent (navegador, SO)
- Breadcrumbs (cliques, logs)
- Custom tags/context (adicionados por você)

### O que Sentry **não** coleta

- Dados de entrada (forms, inputs) — exceto se você explicitamente taggear
- Cookies
- Headers HTTP sensíveis (removidos por default)

### Configurar de novo

Em `web/sentry.config.ts`:

```typescript
beforeSend(event, hint) {
  // Remover dados sensíveis antes de enviar
  if (event.request?.headers?.authorization) {
    delete event.request.headers.authorization;
  }
  return event;
}
```

## Troubleshooting

### "DSN rejeitado" ou "403 Unauthorized"

- Verifica se `NEXT_PUBLIC_SENTRY_DSN` começa com `https://`
- Certifique que está no projeto correto no Sentry
- Tenta logout/login na conta Sentry

### Source maps não aparecem no dashboard

- Verifica `SENTRY_AUTH_TOKEN` é válido
- Tenta fazer deploy sem auth token primeiro (funciona, só sem source maps)
- Verifica logs: `npm run build 2>&1 | grep -i sentry`

### Muitos erros falsos (spam)

Configure em `web/sentry.config.ts`:

```typescript
ignoreErrors: [
  /ResizeObserver loop limit exceeded/,  // Comum em Safari
  /chrome-extension:\/\//,               // Extensions
  /Failed to fetch/,                     // Network errors
]
```

## Leitura recomendada

- [Sentry Next.js Guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Source Maps](https://docs.sentry.io/platforms/javascript/sourcemaps/)
- [Enriching Events](https://docs.sentry.io/platforms/javascript/enriching-events/)
