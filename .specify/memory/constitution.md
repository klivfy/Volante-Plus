<!--
Sync Impact Report
==================
Version change: [TEMPLATE] → 1.0.0 (initial ratification — first time this
project's practice is written down as a constitution, not a reconstruction
of a prior version)

Modified principles: none (first fill; all six principles below are new)

Added sections:
- Core Principles I–VI
- Restrições Adicionais (segurança e operação)
- Fluxo de Desenvolvimento
- Governança

Removed sections: none

Templates requiring follow-up:
- .specify/templates/plan-template.md — no changes required; its
  "Constitution Check" gate already reads this file at runtime.
- .specify/templates/spec-template.md, tasks-template.md,
  checklist-template.md — no changes required (template-agnostic).
- .claude/skills/speckit-*/SKILL.md — no changes required.

Deferred TODOs: none. Every value below is grounded in practice already
enacted and verifiable in this repository's history (commits, docs, code) —
nothing here is aspirational or invented for the occasion. Where the author
is "Claude Code" sessions across time, the principles codify a
consistency those sessions already converged on independently, now made
explicit and enforceable instead of implicit.
-->

# Volante+ Constitution

## Core Principles

### I. Sem Alegação Preditiva Sem Evidência Replicada (NÃO NEGOCIÁVEL)

Nenhum método de geração de jogos, estratégia ou funcionalidade pode se
apresentar como estatisticamente superior ao sorteio aleatório — em UI,
texto, commit ou documentação — sem ter passado por um teste formal contra
um baseline aleatório (`random-uniform`), com a vantagem **replicada** fora
da amostra de seleção. A ausência dessa aprovação não é omissão: é o
resultado padrão, e deve ser comunicada com o mesmo peso que uma aprovação
teria (`web/src/engine/audit/moduleB.ts`/`moduleC.ts`, Regra 5 do protocolo
de auditoria). "Mais sorteadas", "números quentes" e nomes equivalentes
designam uma hipótese sob teste, nunca um fato — a missão declarada do
projeto (`README.md`) é testar, validar ou refutar esses modelos
empiricamente, não vendê-los.

**Racional**: é fácil, e tentador, deixar um gerador "parecer" melhor
construindo a UI em torno do resultado que se queria. Exigir a aprovação
formal antes de qualquer alegação elimina esse grau de liberdade.

### II. Pré-Registro Antes do Dado

Critérios estatísticos (limiares, alfa, tamanho de efeito mínimo, desenho de
split seleção/confirmação) são escritos e commitados **antes** de rodarem
sobre dado real, nunca ajustados depois de ver o resultado. Quando dado real
ainda não existe no repositório, isso não adia o trabalho — determina a
forma dele: o método é implementado e commitado mesmo assim, para que a data
de definição fique registrada no histórico do git (`web/src/engine/audit/preregistration.ts`,
`moduleB.ts`). "Prometo que não olhei antes" não é verificável; a data do
commit é.

**Racional**: a regra mais fácil de violar sem perceber, e a mais difícil de
provar que se cumpriu, é escolher o critério depois de ver o resultado. Only
a timestamped artifact resolves that.

### III. Controles Negativo e Positivo Validam o Instrumento (NÃO NEGOCIÁVEL)

Todo instrumento de medição estatística nova (teste de hipótese, auditoria,
simulação) precisa de, no mínimo, um controle negativo (não pode acusar algo
onde não há) e, quando aplicável, um controle positivo (precisa acusar o que
foi deliberadamente injetado). Um controle negativo sozinho não prova nada —
um instrumento que nunca acusa nada também passa nele. Fórmulas fechadas
novas exigem verificação cruzada independente (ex.: Monte Carlo) antes de
serem adotadas como verdade — ver a checagem de `payoutShare.ts` contra 2
milhões de réplicas independentes antes de ir para produção. O mesmo rigor
vale para o próprio código de teste: um bug na calibração do cálculo de
poder estatístico (`anomalyTests.ts`) só foi pego porque o teste de
calibração comparava contra a nula empírica, não contra a teórica.

**Racional**: testes que nunca são postos à prova contra um caso conhecido
(positivo ou negativo) inspiram falsa confiança — a suíte passa, mas não
significa o que parece significar.

### IV. Procedência e Limitações Sempre Declaradas

Todo dataset usado numa auditoria ou backtest carrega uma procedência
explícita (`official`, `third_party_mirror`, `synthetic`, `unknown`) e
relatórios tratam procedências não oficiais com uma ressalva em destaque,
antes de qualquer resultado (`provenance.ts`). Dado sintético (seed/PRNG)
nunca é auditado como se fosse histórico real — isso mediria o gerador, não
o sorteio. Datas ou valores fabricados para satisfazer validação estrutural
são sempre marcados como aproximados, nunca apresentados como fato. Quando
uma API não expõe um dado necessário (ex.: arrecadação do concurso), o
código não o inventa — a funcionalidade correspondente fica condicionada à
entrada manual do usuário ou é simplesmente omitida, documentando o motivo.

**Racional**: a garantia de que um histórico é "de verdade" é sempre
externa ao código — a guarda existe para pegar o acidente provável (auditar
o próprio seed), não para fingir que resolve o problema geral de dado
fabricado.

### V. Domínio Único Compartilhado Entre Plataformas

Lógica de domínio (geração de jogos, motor de backtesting, modelos de
rateio/popularidade, regras de premiação) tem uma única implementação de
referência por linguagem de execução: `shared/` (Kotlin Multiplatform) para
Android e Desktop, e `web/src/engine/` (TypeScript) para a web — nunca duas
implementações divergentes da mesma fórmula na mesma linguagem. Uma porta
entre linguagens (Kotlin → TypeScript) deve preservar pesos, fórmulas e
constantes byte a byte, com testes que provem a equivalência (ex.: soma
termo a termo da binomial contra a forma fechada), não uma reinterpretação
"similar o bastante".

**Racional**: duas implementações da mesma regra de negócio divergem
silenciosamente com o tempo; uma delas vira a fonte da verdade e a outra um
bug latente.

### VI. Leia a Documentação Antes de Codificar Contra Dependências Não Familiares

Quando uma dependência do projeto está em uma versão mais nova que o
conhecimento de treinamento de quem está codificando (ex.: Next.js 16 —
ver `web/AGENTS.md`), a documentação relevante bundled (`node_modules/*/docs/`)
ou oficial é lida **antes** de escrever código contra essa API, não depois
de um erro em produção. Mudanças de API, convenções e estrutura de arquivo
podem divergir do que parece familiar.

**Racional**: assumir que uma API "deve funcionar como sempre funcionou"
contra uma versão nova é a causa mais comum de bugs sutis e config
incorreta neste projeto (ex.: `Stack` do MUI, Turbopack vs. webpack no
`next build`, Adapter API do Next 16 ainda sem suporte verificado na
Netlify).

## Restrições Adicionais

**Segurança**: nenhuma credencial (keystore, chaves de API, segredos de
assinatura) é commitada em texto plano — `keystore.properties` e
equivalentes ficam fora do git (`.gitignore`), com um `.example` documentado
e fallback por variável de ambiente para CI. `signingConfigs` nunca tem
senha hardcoded no build script.

**CI e operação**: `retention-days` de artefatos de CI é mantido conservador
(ver `.github/workflows/*.yml`) — cota de armazenamento do GitHub Actions é
finita e compartilhada entre todos os workflows do repositório; um valor
alto "para garantir" em um workflow pode bloquear todos os outros quando a
cota estoura. Versões de runtime (Node, Java) são fixadas e mantidas
consistentes entre os caminhos de deploy que as compartilham (`.nvmrc`,
`vercel.json`, `netlify.toml`, CI) — nunca uma versão diferente "por
engano" entre eles.

**Honestidade com o usuário**: nenhuma tela exibe uma medida derivada (ex.:
rateio de prêmio, valor esperado) sem a ressalva que explica o que ela mede
e não mede, no mesmo painel — nunca em outra tela, nunca depois.

## Fluxo de Desenvolvimento

- Desenvolvimento acontece em branches `claude/<descrição-curta>`, nunca
  diretamente em `main`; mudanças chegam a `main` via Pull Request.
- Mensagens de commit explicam o *porquê*, não só o *o quê* — o racional de
  uma decisão não óbvia (por que este algoritmo, por que esta correção, o
  que quebraria sem ela) é parte do commit, não só da conversa que o gerou.
- `CHANGELOG.md` é mantido por versão sob Keep a Changelog, com três trilhas
  de versionamento independentes (Android `versionName`, `app.version` do
  instalador desktop, `web/package.json`) — cada uma evolui no seu próprio
  ritmo; uma mudança só em uma plataforma não força bump nas outras.
- Toda alteração em código relevante (engine estatístico, geração de jogos,
  parsing de dado externo) vem acompanhada de teste automatizado; PRs que
  tocam `web/src/engine/` sem teste correspondente exigem justificativa
  explícita no corpo do PR.
- Documentação (`docs/*.md`) é atualizada no mesmo PR que muda o
  comportamento que ela descreve — documentação desatualizada é tratada como
  bug, não como débito aceitável.

## Governança

Esta constituição tem precedência sobre convenção não escrita ou preferência
individual de uma sessão. Em caso de conflito entre uma instrução ad-hoc e um
princípio NÃO NEGOCIÁVEL (I ou III), o princípio prevalece — quem discordar
propõe uma emenda, não um desvio silencioso.

**Emendas**: alterações a este documento são feitas via `/speckit-constitution`,
nunca por edição direta de `.specify/memory/constitution.md` fora desse
fluxo, para que o relatório de impacto (Sync Impact Report) e o versionamento
semântico fiquem registrados. Versionamento: MAJOR para remoção ou
redefinição incompatível de um princípio existente; MINOR para novo
princípio ou seção, ou expansão material de uma orientação existente; PATCH
para clarificação, correção de texto ou refinamento não semântico.

**Revisão de conformidade**: todo PR que introduz um novo método estatístico,
uma nova integração de dado externo, ou uma nova alegação na UI sobre
desempenho/vantagem é revisado contra os Princípios I, III e IV antes de
merge. Complexidade que viole o Princípio V (domínio duplicado) precisa de
justificativa explícita no PR — "mais rápido fazer separado" não é
justificativa suficiente sozinha.

**Version**: 1.0.0 | **Ratified**: 2026-10-02 | **Last Amended**: 2026-10-02
