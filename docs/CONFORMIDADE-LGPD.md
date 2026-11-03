# Conformidade com a LGPD — Volante+ (Lei nº 13.709/2018)

**Status:** implementado neste ciclo (commit LGPD) · **Política pública:** `/privacidade`
**Data da revisão:** 2026-11-04

Este documento registra a auditoria LGPD do Volante+ e as contramedidas
implementadas. Ele segue a diretriz de conformidade recebida (Privacy by
Design, Privacy by Default, opt-in granular, direitos do titular self-service,
documentação ROPA).

---

## 1. Resumo da auditoria → ações

| # | Achado (antes) | Risco LGPD | Ação implementada |
|---|----------------|-----------|-------------------|
| 1 | Sentry (cliente) carregava após idle **sem perguntar** ao titular — captura IP, agente e stack de erro | Tratamento de dados pessoais sem base legal declarada; sem opt-in | Portão de consentimento: `services/diagnostics.ts` só agenda o `Sentry.init` se a categoria **`diagnosticos`** estiver concedida; opt-in tardio carrega na hora (`loadDiagnosticsNow`). Além disso `sendDefaultPii: false` no `sentry.config.ts` |
| 2 | Plausible Analytics injetado no `<head>` em todo carregamento com `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Script de analytics sem opt-in (diretriz §2.1: analíticos **desativados por padrão**) | Componente cliente `PlausibleScript.tsx`: injeta o script **somente** com consentimento `analiticos`, remove no ato se revogado, nunca injeta sem decisão |
| 3 | Sem banner de consentimento, sem preferências, sem política | Diretriz §2.1 e §4 ausente por completo | `ConsentBanner` (opt-in, paridade de botões) + `ConsentPreferencesDialog` (granular) + página `/privacidade` (política completa) |
| 4 | Sem mecanismo de exercício dos direitos do titular (Art. 18) | Acesso/portabilidade/eliminação impossíveis | Painel self-service em `/privacidade` (seção 7): exportação `.json` interoperável e eliminação imediata de TODOS os dados locais, via `services/localData.ts` |
| 5 | Sem canal do Encarregado visível | Diretriz §4.3 | Rodapé global (`SiteFooter`) com link para `/privacidade` e contato do DPO; canal também na política e no banner |
| 6 | CSP sem `script-src` | Qualquer script de terceiro podia executar livremente | CSP com `script-src 'self' 'unsafe-inline' <origem do Plausible>` — SDK do Sentry é bundled (self), sem CDN |
| 7 | Headers HSTS, XCTO, Referrer-Policy, Permissions-Policy, frame-ancestors | — | **Já conformes** (mantidos) |
| 8 | Sem formulários, cadastro, CPF, gênero, nascimento | — | **Já conforme** (minimização natural): app sem contas, sem backend de dados pessoais |
| 9 | Push notifications pediam permissão do navegador | — | **Já conforme**: opt-in nativo, revogável; inscrição em memória no processo do servidor |
| 10 | Splash usava `sessionStorage` sem necessidade de consentimento | — | **Já conforme**: armazenamento estritamente necessário (desaparece ao fechar a aba) |

## 2. Arquitetura do consentimento

**Categorias** (`services/consent.ts` — fonte da verdade):

| Categoria | Scripts que governa | Padrão | Base legal quando ligada |
|-----------|--------------------|--------|--------------------------|
| Necessários | — (sessão, preferências funcionais, IndexedDB do app) | Sempre ativos | Art. 7º, V — não é consentimento |
| `analiticos` | Plausible Analytics (cookieless, agregado) | **Desligado** | Art. 7º, I — consentimento |
| `diagnosticos` | Sentry (erros, IP, agente) | **Desligado** | Art. 7º, I — consentimento |
| `marketing` | **Nenhum hoje** (registrada para transparência e uso futuro) | **Desligado** | Art. 7º, I quando aplicável |

**Regras implementadas:**

- **Opt-in real:** estado "não decidido" (`readConsent() === null`) bloqueia
  tudo que não é essencial. Nenhum consentimento implícito por navegação.
- **Privacy by Default:** todos os switches nascem desmarcados; nenhum
  checkbox pré-selecionada em qualquer fluxo.
- **Paridade de botões:** "Rejeitar não essenciais" é `contained` (mesmo peso
  visual e posição que "Aceitar todos") no banner e no diálogo.
- **Efeito imediato:** ligar `analiticos` injeta o Plausible no ato; revogar
  remove o script e recarrega o estado da UI via evento
  `volante:consent-changed` + `useSyncExternalStore`.
- **Persistência:** `localStorage["volante_consent_v1"]` com `version`,
  `decidedAt` (prova do momento da decisão) e as três concessões. Registro
  corrompido/versão desconhecida = não decidido (fallback seguro).
- **Storage indisponível:** o app continua utilizável com tudo desligado; o
  banner volta na próxima visita (comportamento seguro, nunca bloqueia).

**Fluxo dos portões de script:**

```
instrumentation-client.ts ──► diagnostics.loadDiagnosticsWhenIdle()
                                  └─ só agenda se consent.diagnosticos ──► import('../sentry-client-init')
ConsentProvider.saveGrants ──► (diagnosticos ligado agora?) ──► diagnostics.loadDiagnosticsNow()
PlausibleScript (mount + evento) ──► consent.analiticos ? injeta <script> : remove()
```

## 3. Registro de Operações de Tratamento (ROPA)

| Operação | Finalidade | Titulares | Dados | Base legal | Retenção / expurgo | Segurança |
|----------|-----------|-----------|-------|-----------|--------------------|-----------|
| Execução do app (sessão, preferências, splash) | Entregar o serviço estatístico no dispositivo | Visitantes | Dados técnicos locais, sem identificação | Execução de contrato (Art. 7º, V) | No dispositivo até eliminação pelo titular | Acesso apenas pela origem do app |
| Histórico de concursos (IndexedDB `volante-plus`) | Análise, backtesting, geração de jogos | Visitantes | Dados PÚBLICOS da Caixa (não pessoais) | Não se aplica (sem dado pessoal) | Até eliminação local | Local |
| Diagnóstico de erros (Sentry) — **opt-in** | Detectar e corrigir falhas | Visitantes que consentiram | Mensagem de erro, stack, agente, IP (PII desativada) | Consentimento (Art. 7º, I) | Configuração da plataforma Sentry (padrão de mercado 90 dias) | TLS; `sendDefaultPii: false`; sem credenciais (`beforeSend` remove Authorization) |
| Métricas de acesso (Plausible) — **opt-in** | Medir uso agregado do app | Visitantes que consentiram | Contagens agregadas de página, sem cookies | Consentimento (Art. 7º, I) | Configuração da conta Plausible | Cookieless; agregação |
| Push de concursos novos | Avisar sobre sorteios | Usuários que concederam permissão | Endpoint de inscrição + chaves VAPID | Consentimento (Art. 7º, I — permissão do navegador) | Memória do processo do servidor; desinscrição remove | Endpoint opaco (token); sem dados pessoais associados |
| Auditoria de segurança do servidor (futuro) | Detecção de abuso | — | — | Legítimo interesse (Art. 7º, IX) — se implementado, exige avaliação de impacto | — | — |

**Logs de auditoria (diretriz §3.4):** hoje o app não tem endpoints que leiam
ou alterem dados pessoais (não há contas). Os endpoints de push registram
apenas o endpoint opaco em memória. Quando qualquer recurso novo passar a
tratar dado pessoal, registre aqui: `timestamp`, `user_id`, `actor_id`,
`action`, `ip_origem` — nunca senhas nem credenciais.

## 4. Ciclo de vida e expurgo

- **Eliminação (Art. 18, VI):** `clearLocalData()` apaga IndexedDB
  (`db.delete()`), localStorage, sessionStorage, caches do service worker e
  desinscreve o push — imediato e irreversível, acionado pelo próprio titular
  em `/privacidade`. Não há cópia central para expurgar (sem servidor de
  dados pessoais).
- **Isolamento de ambientes:** não há base de dados de staging/homologação;
  o desenvolvimento roda sem DSN de Sentry e sem domínio Plausible — nenhum
  dado sai do ambiente local.
- **Criptografia:** trânsito via HTTPS/HSTS no hosting; repouso restrito ao
  dispositivo do titular (sem volumes próprios — N/A para senhas: não há
  login).

## 5. Segurança aplicada (diretriz §3.2)

| Controle | Implementação |
|----------|---------------|
| HSTS | `Strict-Transport-Security: max-age=63072000; includeSubDomains` |
| CSP | `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' <plausible>` |
| Anti-sniffing / clickjacking | `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY` |
| Referrer / permissões | `strict-origin-when-cross-origin`; `camera=(), microphone=(), geolocation=(), payment=()` |
| Senhas | N/A (sem autenticação) — quando houver: Argon2id/bcrypt com salt |

## 6. Como manter a conformidade (checklist para novos recursos)

1. **Novo script de terceiro?** Registre a categoria em
   `services/consent.ts` + descrição honesta no diálogo de preferências
   (`locales/pt-BR/common.json` → `consent.category*`), implemente o portão
   no padrão `PlausibleScript.tsx` (injeção pós-consentimento) e, se for
   CDN, inclua a origem no CSP `script-src` de `next.config.ts`.
2. **Novo dado local?** Atualize `describeLocalData`/`buildLocalDataExport`
   para que o export continue completo (portabilidade).
3. **Novo tratamento de dado pessoal?** Adicione linha na ROPA (seção 3) e
   na tabela da `/privacidade`, com base legal e retenção.
4. **Novo endpoint com dado pessoal?** Log de auditoria com
   `timestamp/user_id/actor_id/action/ip_origem`, sem credenciais.
5. **Testes:** manter verdes os de `consent.test.ts`, `localData.test.ts` e
   `e2e/consent.spec.ts` — eles codificam as regras desta diretriz.

## 7. Pendências e limitações honestas

| Item | Situação | Ação necessária |
|------|----------|-----------------|
| **E-mail do Encarregado (DPO)** | `privacidade@volanteplus.app` é **placeholder** (`src/config/privacy.ts`) | Definir caixa real e substituir ANTES de operar com dados pessoais; sem isso o canal do titular é fictício |
| Retenção Sentry/Plausible | Padrões de mercado, sujeitos à conta do operador | Fixar explicitamente nas configurações das contas quando criadas |
| Contas de usuário | Não existem (por design) | Se um dia existirem: painel de direitos em rota dedicada (`/configuracoes/privacidade`) e logs de auditoria |
| DPO formal (Art. 41) | Aplicabilidade a avaliar: o app não trata dado pessoal sem opt-in e não faz perfil | Se a operação crescer (ex.: contas, newsletters), designar Encarregado formalmente |

## 8. Cobertura por testes

- **Unitários** (`vitest`): semântica de opt-in/revogação/persistência
  (`consent.test.ts`, 9 testes); exportação/eliminação/resumo dos dados
  locais (`localData.test.ts`, 9 testes).
- **E2E** (`playwright`, `e2e/consent.spec.ts`, 7 testes): banner na 1ª
  visita, paridade de botões, rejeitar → tudo desligado + sem script de
  métricas + banner não volta no reload; aceitar tudo; preferências com
  switches desmarcados por padrão e salvamento granular; página
  `/privacidade` com estado, exportação com nome de arquivo, confirmação de
  eliminação e diálogo de preferências pré-carregado.
- **Ajuste honesto:** `e2e/offline.spec.ts` ganhou alternativa válida
  (mensagem de erro **ou** dados do concurso em cache) — a premissa antiga
  "sem internet na 1ª visita" não vale em ambientes conectados e o teste
  falhava também sem as mudanças LGPD (verificado por rebuild do código
  anterior).
