# Spec Kit (Spec-Driven Development)

[github/spec-kit](https://github.com/github/spec-kit) instalado no repositório
em 2026-10-02, integração `claude`, scripts `sh`. Nenhum arquivo do projeto foi
sobrescrito — o instalador só adicionou `.specify/` (infraestrutura) e
`.claude/skills/speckit-*` (os comandos, expostos como skills do Claude Code).

## O que é

Um fluxo opcional, em cima do Claude Code, para desenvolver feature por
feature com uma sequência fixa de artefatos — especificação → plano → tarefas
→ implementação — em vez de ir direto ao código. Útil para uma mudança grande
o bastante para valer a pena escrever a intenção antes da implementação; para
um fix pontual, o fluxo normal (sem spec-kit) continua sendo o caminho mais
rápido.

## Comandos instalados

Via skills do Claude Code (`.claude/skills/speckit-*/SKILL.md`), invocáveis
como `/speckit-<nome>`:

| Comando | Uso |
|---|---|
| `/speckit-constitution` | Estabelece os princípios do projeto — ver "Próximo passo" abaixo, ainda não rodado |
| `/speckit-specify` | Cria a especificação de uma feature a partir de uma descrição em linguagem natural |
| `/speckit-plan` | Deriva o plano de implementação a partir da especificação |
| `/speckit-tasks` | Quebra o plano em tarefas executáveis |
| `/speckit-implement` | Executa as tarefas |
| `/speckit-converge` | Avalia o estado atual do código e anexa o trabalho restante como tarefas |

Opcionais, para aumentar a confiança do fluxo:

| Comando | Quando |
|---|---|
| `/speckit-clarify` | Antes de `/speckit-plan`, quando a especificação tem ambiguidade |
| `/speckit-analyze` | Depois de `/speckit-tasks`, antes de `/speckit-implement` — checa consistência entre os artefatos |
| `/speckit-checklist` | Depois de `/speckit-plan` — gera checklist de completude/clareza dos requisitos |

## Próximo passo: ratificar a constituição

`.specify/memory/constitution.md` ainda é o template vazio do spec-kit
(placeholders `[PRINCIPLE_N_NAME]` etc.) — instalar a ferramenta não inventa
princípios por conta própria. Quem for usar o fluxo deve rodar
`/speckit-constitution` e decidir explicitamente o que vai lá; não foi
pré-preenchido aqui.

## Estrutura instalada

```
.specify/
├── memory/constitution.md       # template vazio, ver acima
├── templates/                   # specify/plan/tasks/checklist
├── scripts/bash/                # scripts usados pelas skills (sh, não ps1)
├── workflows/speckit/           # workflow bundled (specify → plan → tasks → implement)
├── integration.json             # integração ativa: claude
└── .gitignore                   # estado local de máquina (feature.json etc.) — não versionado

.claude/skills/speckit-*/        # os comandos acima, um por diretório
```

`.specify/.gitignore` cobre apenas estado por-máquina (ex.: qual feature está
ativa agora); os templates, scripts e skills são versionados normalmente.

## Manutenção

Reinstalar/atualizar sem perder o que já foi ratificado:

```bash
uvx --from git+https://github.com/github/spec-kit.git specify init --here --force --non-interactive --integration claude --script sh
```

`specify check` verifica as ferramentas requeridas; `specify self upgrade`
atualiza o próprio CLI.
