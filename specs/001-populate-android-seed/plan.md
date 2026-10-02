# Implementation Plan: Seed Completo do Histórico Oficial no Android

**Branch**: `001-populate-android-seed` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-populate-android-seed/spec.md`

## Summary

Gerar `app/src/main/assets/seed/{megasena,maismilionaria}.csv` a partir do
histórico já validado em `web/src/data/history/*.json` (fonte única,
Princípio V da Constituição), via um script Node repetível em
`scripts/generate-android-seed.mjs` que aborta sem gravar nada se o
resultado não for contíguo do concurso 1 ao último ou violar as regras de
alguma modalidade — mesmo desenho defensivo de `web/scripts/update-history-seed.mjs`,
reaplicado aqui em vez de reinventado. Uma suíte de testes JVM nova
(`app/src/test/.../data/seed/SeedHistoryIntegrityTest.kt`) garante que o CSV
gerado parseia por `CsvDrawParser` sem erro e que um seed corrompido é
rejeitado (Princípio III, controles negativo/positivo — NÃO NEGOCIÁVEL).

## Technical Context

**Language/Version**: Node.js (ESM, `.mjs`) para o script de geração — mesma
stack de `web/scripts/update-history-seed.mjs` e de `scripts/sync-extension-versions.mjs`
(já na raiz do repo); Kotlin/JVM para o teste de integridade, no mesmo
módulo (`app/`) e estilo (JUnit4, `org.junit.Test`) do `CsvDrawParserTest.kt`
já existente.

**Primary Dependencies**: Nenhuma dependência nova. Script usa só `node:fs`/`node:path`
(built-ins), como o script web equivalente. Teste usa `CsvDrawParser`
(já em `shared/`, Kotlin Multiplatform) e JUnit4 (já em uso em `app/src/test`).

**Storage**: Arquivos CSV estáticos, commitados e empacotados como asset do
APK (`app/src/main/assets/seed/`) — não é um banco, não muda em runtime.

**Testing**: Teste JVM (`./gradlew :app:testDebugUnitTest`), lendo os dois
CSVs commitados do caminho do módulo e parseando via `CsvDrawParser`.

**Target Platform**: O artefato gerado roda no Android (consumido por
`AssetDrawSeeder` na primeira execução do app); o script gerador roda em
qualquer máquina de desenvolvimento/CI com Node, nunca no dispositivo.

**Project Type**: Pipeline de dados interno (gera um asset versionado) +
asset Android — não é um novo app/serviço, não introduz uma 4ª plataforma.

**Performance Goals**: Geração conclui em segundos — os JSON de origem têm
algumas centenas de KB (3.063 + 393 concursos hoje); não é um caminho
sensível a latência de usuário.

**Constraints**: O script MUST rodar sem acesso à rede (a fonte já está
commitada em `web/src/data/history/`, nenhuma chamada de API aqui — ver
Constitution Check, Princípio V); a saída MUST bater exatamente o contrato
de formato que `app/src/main/assets/seed/README.md` e `CsvDrawParser` já
definem, sem exigir mudança no parser; a geração MUST ser determinística
(mesmo JSON de entrada → mesmo CSV de saída, byte a byte).

**Scale/Scope**: ~3.063 concursos de Mega-Sena + ~393 de +Milionária hoje,
crescendo poucas dezenas de linhas por regeneração futura — escala trivial,
sem necessidade de streaming/paginação.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Aplica-se? | Avaliação |
|---|---|---|
| I. Sem alegação preditiva sem evidência replicada | Não | Feature não envolve estratégia de geração de jogos nem alegação de desempenho. |
| II. Pré-registro antes do dado | Não diretamente | Não é um teste de hipótese estatística; o "critério fixado antes" equivalente aqui é o contrato de formato já existente (`assets/seed/README.md`), que esta feature consome e não reabre. |
| III. Controles negativo e positivo validam o instrumento (NÃO NEGOCIÁVEL) | **Sim** | Vincula o desenho de teste: `SeedHistoryIntegrityTest` precisa de um caso que passa com o seed real (negativo — não acusa o que está correto) e um caso com seed deliberadamente corrompido que falha de forma clara (positivo — User Story 3 / FR-008 da spec). |
| IV. Procedência e limitações sempre declaradas | **Sim** | `app/src/main/assets/seed/README.md` precisa continuar deixando claro que a fonte é uma agregação de terceiros (via o histórico já rotulado como tal em `docs/historico.md`), não a exportação oficial direta da Caixa — nunca apresentar o seed Android como mais "oficial" do que o da web. |
| V. Domínio único compartilhado entre plataformas | **Sim — é o eixo da feature** | O script gerador só pode ler de `web/src/data/history/`; nunca chama a API de loterias por conta própria. Duas derivações independentes do "histórico oficial" divergiriam silenciosamente com o tempo — é exatamente o que esta feature existe para evitar. |
| VI. Leia a documentação antes de código contra dependência não familiar | Não | Node ESM e JUnit4/Kotlin-JVM já são padrões em uso neste repo; nenhuma versão nova de framework envolvida. |

**Resultado**: PASS. Nenhuma violação a justificar — tabela de Complexity
Tracking fica vazia.

## Project Structure

### Documentation (this feature)

```text
specs/001-populate-android-seed/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md         # Fase 1
├── contracts/
│   └── csv-seed-format.md
├── quickstart.md         # Fase 1
└── tasks.md              # Fase 2 (/speckit-tasks, não criado aqui)
```

### Source Code (repository root)

```text
scripts/
└── generate-android-seed.mjs   # NOVO — lê web/src/data/history/*.json,
                                  # valida, escreve os CSVs abaixo

app/src/main/assets/seed/
├── README.md                    # ATUALIZADO — documenta o comando de
│                                 # geração em vez de "cole aqui manualmente"
├── megasena.csv                 # NOVO — gerado, commitado
└── maismilionaria.csv           # NOVO — gerado, commitado

app/src/test/java/com/volanteplus/loterias/data/seed/
└── SeedHistoryIntegrityTest.kt  # NOVO — ao lado do CsvDrawParserTest.kt
                                  # já existente; mesmo estilo (JUnit4)

README.md                        # ATUALIZADO — Roadmap: item marcado [x]
docs/historico.md                # ATUALIZADO — nota curta de rastreabilidade
                                  # (o seed Android vem deste mesmo histórico)
```

**Structure Decision**: Nenhuma estrutura nova de projeto — a feature
acrescenta um script na pasta `scripts/` já existente na raiz (mesmo nível
de `sync-extension-versions.mjs`), dois arquivos de asset no diretório que
já existe e já é consumido por `AssetDrawSeeder` sem mudança nele, e um
teste no módulo `app/` ao lado do teste já existente para o mesmo parser.
Não introduz módulo, pacote ou camada nova.

## Complexity Tracking

*Vazio — nenhuma violação da Constitution Check a justificar.*

## Constitution Check — reavaliação pós-design (Fase 1)

Nenhum artefato da Fase 1 abriu violação nova:

- `data-model.md` não introduz entidade com estado ou dependência externa
  nova — confirma Princípio V (a única fonte lida é `web/src/data/history/`).
- `contracts/csv-seed-format.md` documenta um contrato que já existia; não
  propõe mudança em `CsvDrawParser`/`AssetDrawSeeder`.
- `quickstart.md` cristaliza os dois controles exigidos pelo Princípio III
  (seed real passa, seed corrompido falha de forma localizável) como passo
  de verificação explícito, não deixado implícito.

**Resultado**: PASS, mantido.
