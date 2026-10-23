# Quickstart: validar a Quina de ponta a ponta

Roteiro de validação da feature `003-quina-lottery`. Não repete detalhes de
implementação: remete aos contratos e ao modelo de dados.

## Pré-requisitos

- Node.js (versão de `.nvmrc`), JDK 17+ e Android SDK para o Gradle.
- Rede **apenas** nos passos 1 e 2 (coleta do seed). Nenhum teste automatizado
  usa rede.
- Ambiente de desenvolvimento remoto sem o plugin do Android: o Kotlin é
  validado pelo CI do GitHub (`./gradlew :app:testDebugUnitTest`).

## Passo 0 — Antes de tocar no código: capturar a referência (SC-005)

Capturar o **teste dourado** de Mega-Sena e +Milionária (backtest com
semente fixa, chances e retorno esperado por faixa, lote gerado) nos dois
lados (Kotlin e TypeScript) e commitá-lo antes de qualquer refatoração.
Também commitar os critérios dos controles da Quina (taxa de falso positivo,
tamanho do viés injetado, nº de réplicas) antes de rodá-los sobre o histórico
real (Princípio II).

## Passo 1 — Gerar o histórico (web, fonte única)

```bash
cd web
node scripts/update-history-seed.mjs            # baixa quina da API e valida
```

Esperado: o script aborta sem gravar nada se houver lacuna, dezena fora de
1–80, trevo, ou divergência de dezenas/datas contra
`src/data/mirrorSnapshot/quina.json`; ao terminar imprime, por modalidade,
quantos concursos e a data do último (Quina hoje: 7.149, até 2026-10-22).
Conferir `src/data/history/meta.json` → `lotteries.quina`.

## Passo 2 — Gerar o seed do Android a partir do histórico web

```bash
node scripts/generate-android-seed.mjs          # da raiz do repositório
```

Esperado: `app/src/main/assets/seed/quina.csv` com 1 linha de cabeçalho + o
mesmo número de concursos de `meta.json`; as três modalidades são validadas
antes de gravar qualquer arquivo; rodar duas vezes gera arquivos idênticos.

## Passo 3 — Chances e regras (SC-003, `contracts/quina-official-rules.md`)

Na web e no Android, escolher a Quina: uma aposta simples mostra **1 em
24.040.016** para a quina; as chances de quadra/terno/duque e o preço
(`C(n,5) × R$ 3,00`, de 5 a 15 dezenas) conferem com as tabelas do contrato;
o volante só aceita de 5 a 15 dezenas em 1–80.

## Passo 4 — Testes automatizados

```bash
cd web && npm test                               # vitest (unidade + paridade + controles)
cd web && npm run test:e2e                       # Playwright: alternar para a Quina
./gradlew :app:testDebugUnitTest                 # JUnit (CI no ambiente remoto)
```

Esperado: tudo verde, incluindo (a) teste dourado inalterado para as duas
modalidades antigas, (b) controle negativo da Quina sem sinal além do falso
positivo declarado, (c) controle positivo detectado, (d) seeds corrompidos
rejeitados (lacuna, dezena 81, 6 dezenas, trevo), (e) casos de paridade
Kotlin ↔ TypeScript de `contracts/cross-platform-parity.md`.

## Passo 5 — Backtesting da Quina (SC-001, SC-007)

Em instalação nova e **sem rede**: escolher a Quina, definir uma data de
corte e gerar o relatório. Esperado: histórico do concurso 1 ao último do
seed, relatório com a distribuição de acertos de 0 a 5 e o aviso de que o
backtesting não prevê resultados; nenhum atraso perceptível frente à
Mega-Sena.

## Passo 6 — Atualização sem perda (SC-005, FR-012) — manual

Num aparelho com o app **anterior** já sincronizado (Mega-Sena e
+Milionária), atualizar para a nova versão: o histórico existente permanece
igual, a Quina aparece e é semeada uma vez, sem duplicar nem sobrescrever
concursos.

## Passo 7 — Desktop (Decisão 9)

No desktop, alternar para a Quina, usar **Importar CSV** com
`app/src/main/assets/seed/quina.csv` e gerar o relatório. Esperado: mesmo
resultado do Android para o mesmo corte e semente.
