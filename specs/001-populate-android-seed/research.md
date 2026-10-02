# Phase 0 Research: Seed Completo do Histórico Oficial no Android

Nenhum item da Technical Context ficou marcado `NEEDS CLARIFICATION` — esta é
uma feature brownfield com precedente direto no próprio repositório
(`web/scripts/update-history-seed.mjs` resolveu o mesmo problema para a
mesma fonte de dado). As decisões abaixo registram por que o precedente é
reaplicado, não reinventado, e onde ele é deliberadamente **não** seguido.

## Decisão 1 — Fonte única: `web/src/data/history/*.json`, nunca uma segunda busca

**Decision**: O script gerador do seed Android lê exclusivamente os arquivos
já commitados em `web/src/data/history/` (e seu `meta.json`). Nunca chama a
API de loterias por conta própria.

**Rationale**: É o próprio eixo da feature (Constitution, Princípio V). O
histórico da web já passou pela validação cara (contiguidade, regras de
modalidade, conferência contra um segundo espelho independente) — refazer
essa validação a partir de uma segunda chamada à API criaria uma segunda
"fonte da verdade" que pode divergir da primeira silenciosamente com o
tempo, exatamente o problema que a Constituição nomeia.

**Alternatives considered**:
- *Android busca sua própria cópia da API de loterias*: rejeitada — duplica
  o trabalho de validação já feito e reabre a pergunta "e se as duas
  derivações divergirem?", que é o que esta feature existe para fechar.
- *Extrair a lógica de geração para um módulo compartilhado (`shared/`)
  chamável de JS e Kotlin*: rejeitada por desproporcional — é uma conversão
  de formato, rodada manualmente/por CI, não um caminho de execução do app;
  um script standalone no mesmo estilo do já existente é suficiente e mais
  simples de revisar.

## Decisão 2 — Contrato CSV existente, sem tocar em `CsvDrawParser`

**Decision**: O CSV gerado respeita exatamente o formato já documentado em
`app/src/main/assets/seed/README.md` (separador `;`, cabeçalho
`# concurso;data;dezenas;trevos`, data ISO-8601, dezenas/trevos separados
por espaço, coluna de trevos vazia na Mega-Sena) — zero mudança em
`CsvDrawParser` ou `AssetDrawSeeder`.

**Rationale**: O contrato já existia antes de qualquer CSV real existir
(o README do diretório descreve o formato esperado desde antes desta
feature) — tratá-lo como fixo, não como algo a "melhorar" de passagem,
evita reabrir um parser já testado e em produção por uma razão que não é o
escopo desta feature.

**Alternatives considered**:
- *Trocar o seed Android para o mesmo formato JSON (tuplas) que a web usa*:
  rejeitada — exigiria mudar `CsvDrawParser`/`AssetDrawSeeder`, e a própria
  especificação marca isso como fora de escopo.

## Decisão 3 — Teste de integridade ao lado do `CsvDrawParserTest.kt` existente

**Decision**: `SeedHistoryIntegrityTest.kt` novo entra em
`app/src/test/java/com/volanteplus/loterias/data/seed/`, mesmo pacote e
estilo (JUnit4, `org.junit.Test`) do `CsvDrawParserTest.kt` já existente —
não em `shared/src/commonTest/`.

**Rationale**: `CsvDrawParser` já mora em `shared/` (Kotlin Multiplatform),
mas o teste dele ficou em `app/src/test` quando o código foi movido — esse
é o padrão já estabelecido neste repositório para testes deste parser
especificamente. Seguir o precedente exato evita introduzir, como efeito
colateral desta feature, um novo source set de teste (`commonTest`) que
hoje não tem nenhum arquivo.

**Alternatives considered**:
- *Mover para `shared/src/commonTest/`, rodando também em desktop/iOS*:
  rejeitada como escopo além do pedido — o desktop não empacota
  `assets/seed/` (usa importação via CSV manual, ver `docs/DESKTOP.md`), e
  decidir popular `commonTest` pela primeira vez é uma decisão arquitetural
  própria, não um efeito colateral desta feature.

## Decisão 4 — Geração falha fechada (fail-closed), nunca grava resultado parcial

**Decision**: O script aborta sem escrever nenhum arquivo se encontrar
qualquer lacuna na sequência de concursos ou qualquer violação das regras
de modalidade na fonte lida — mesmo desenho de
`web/scripts/update-history-seed.mjs`.

**Rationale**: Constitution, Princípio III (controles validam o
instrumento, NÃO NEGOCIÁVEL) e FR-004 da especificação. Um seed truncado
silenciosamente commitado é pior que nenhum seed — o app mostraria
backtesting incorreto sem avisar ninguém.

**Alternatives considered**:
- *Gerar mesmo com avisos, deixando quem revisar o PR decidir*: rejeitada —
  contraria FR-004 e o padrão já em vigor no script web equivalente.

## Decisão 5 — Nenhuma dependência nova

**Decision**: O script usa só `node:fs`/`node:path` (built-ins, como o
script web equivalente); o teste usa só `CsvDrawParser` (já existente) e
JUnit4 (já em uso em `app/src/test`). Nenhum pacote novo em nenhum
`package.json`/`build.gradle.kts`.

**Rationale**: A tarefa é ler dois arquivos JSON já commitados e escrever
dois arquivos de texto — não há necessidade real de uma biblioteca externa,
e cada dependência nova é superfície de manutenção que a Constituição
(Restrições Adicionais) pede para justificar, não assumir por conveniência.
