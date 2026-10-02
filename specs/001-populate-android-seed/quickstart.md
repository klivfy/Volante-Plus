# Quickstart: validar o seed completo do histórico no Android

Pré-requisitos: Node.js instalado (mesma versão usada em `web/`, ver
`web/.nvmrc`); JDK 17+ e Android SDK para rodar os testes do módulo `app`
(ver `README.md` raiz, seção "Build").

## 1. Gerar (ou regenerar) o seed

```bash
node scripts/generate-android-seed.mjs
```

**Resultado esperado**: o script termina com um resumo por modalidade —
quantidade de concursos incluídos e data do último concurso coberto (FR-005)
— e `app/src/main/assets/seed/megasena.csv` / `maismilionaria.csv` existem,
não vazios. Se a fonte (`web/src/data/history/`) estiver ausente, incompleta
ou com qualquer concurso fora das regras da modalidade, o script termina com
erro e **nenhum** arquivo CSV é escrito/sobrescrito (Decisão 4 de
`research.md`).

## 2. Verificar a integridade do seed gerado

```bash
./gradlew :app:testDebugUnitTest --tests "*SeedHistoryIntegrityTest*"
```

**Resultado esperado**: passa, confirmando — para as duas modalidades —
sequência de concursos contígua de 1 até o último, nenhuma dezena/trevo fora
das regras, e contagem batendo com
`web/src/data/history/meta.json` (SC-002 da spec). Rodar com um dos dois
CSVs deliberadamente corrompido (por exemplo, um `concurso` removido no
meio do arquivo) deve falhar o teste apontando o problema — essa é a
confirmação do controle positivo (User Story 3 / Princípio III).

## 3. Confirmar o cenário fim-a-fim (User Story 1)

Num emulador ou dispositivo com uma instalação nova do app (sem dados
locais prévios) e **sem rede** (modo avião):

1. Instalar e abrir o app.
2. Ir para a tela de Backtesting.
3. Confirmar que o relatório é gerado normalmente, cobrindo o histórico
   completo de cada modalidade presente no seed — sem mensagem de erro de
   rede bloqueando o fluxo (SC-001).

## 4. Confirmar que uma instalação já existente não é afetada (edge case)

Com um dispositivo que já tinha o app instalado e sincronizado **antes**
desta feature (banco local não vazio), atualizar para a versão com o novo
seed e confirmar que o histórico local existente não foi duplicado nem
sobrescrito (FR-007) — `AssetDrawSeeder.seedIfEmpty` já garante isso por
construção (só importa quando a tabela está vazia), este passo é só a
confirmação manual.

## Onde olhar se algo falhar

- Contagem não bate com `meta.json`: o script de geração tem um bug de
  conversão — ver `data-model.md` para a invariante exata.
- `CsvDrawParser` rejeita o CSV gerado: o produtor violou o contrato — ver
  `contracts/csv-seed-format.md`.
- Resumo do script não aparece / processo é silencioso: viola FR-005,
  revisar o script antes de considerar a tarefa concluída.
