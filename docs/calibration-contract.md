# Contrato de Calibração Estatística

> Fase 1 do Plano de Confiabilidade Estatística. Este documento é a política
> que acompanha o catálogo executável em
> `web/src/engine/calibration/catalog.ts` — o catálogo é a fonte de verdade;
> este texto explica as regras do jogo.

## O que é calibrado aqui (e o que não é)

Os sorteios das loterias da Caixa são **eventos aleatórios independentes**.
Nenhum método deste repositório prevê resultados, e nenhum incremento de
confiabilidade aumenta a chance de acerto de uma aposta. Calibração significa
algo específico: **que "anomalia com α = 5%" exibido na interface corresponda a
um falso-positivo real ≤ 5% + tolerância, medido por simulação** — e que isso
continue verdadeiro depois de cada mudança no código.

## O contrato

Cada método que faz afirmação de significância declara no catálogo:

| Campo | Significado |
|---|---|
| `method` | Identificador estável (módulo + espaço quando aplicável) |
| `claim` | A afirmação estatística que o usuário vê |
| `alpha` | Nível de significância nominal prometido (`null` = método exato) |
| `kind` | `monte-carlo` (medido em históricos honestos) ou `exato` (recomputação independente) |
| `surface` | Onde a afirmação aparece (UI ou "interno/auditoria") |
| `lottery` | Modalidade de referência da medição |
| `smoke` | Entra no teste de unidade rápido (prova do mecanismo) |

### Critérios numéricos

| Verificação | N de históricos | Critério | Onde roda |
|---|---|---|---|
| Fumaça (unidade) | 300 (400 concursos cada) | lim. sup. do IC de Wilson 95% ≤ α + 5 p.p. | `vitest` a cada PR |
| Gate do contrato (CI) | 2.000 (implementado na Fase 3) | lim. sup. do IC de Wilson 95% ≤ α + 2 p.p. | workflow `calibration.yml` (semanal + releases) |

A decisão usa o **limite superior do intervalo de Wilson**, nunca a proporção
pontual: uma execução individual raramente mente, mas nunca decide. O método
sonda (α = 0,5, mal calibrado de propósito) reprova sempre — se não reprovar,
o harness está errado, não o método.

## Como reproduzir

```bash
cd web && npx vitest run src/engine/__tests__/calibration.test.ts
```

A semente base (`SMOKE_SEED_BASE = 20261028`) é pública: qualquer pessoa, no
mesmo commit, obtém exatamente os mesmos históricos (mulberry32 via
`createSeededRandom`) e os mesmos vereditos. Históricos honestos são gerados
sob o modelo nulo — sorteio uniforme e independente, sem reposição dentro do
concurso, datas em UTC.

## Resultado da Fase 1 (N = 300, semente 20261028)

| Método | FPR medido | IC 95% | Limite | Veredito |
|---|---|---|---|---|
| numberEvidence (dezenas) | 3,3% | [1,8; 6,0] | 10% | PASS |
| numberEvidence (trevos) | 2,7% | [1,4; 5,2] | 10% | PASS |
| collisionTest | 0,0% | [0,0; 1,3] | 10% | PASS |
| frequencyFairnessTest | 3,7% | [2,1; 6,4] | 10% | PASS |
| chiSquareGlobal (numberEvidence) | 3,7% | [2,1; 6,4] | 10% | PASS |
| sonda (α = 0,5) | 44,3% | — | 10% | FAIL (esperado) |

O `collisionTest` com 0 sinalizações em 300 é coerente: seu p-valor é discreto
(cauda superior de Poisson com contagem esperada baixa), o que o torna
conservador nesse comprimento de histórico. O `walkForwardMulti` não entra na
fumaça por custo (vários backtests completos por histórico) — é medido pelo
gate de CI da Fase 3 (tabela abaixo), com adaptador próprio no runner.

## Relatório de auditoria (Fase 2)

O relatório de auditoria transforma a medição em evidência registrada — e **não
é escrito à mão por ninguém**: nasce do mesmo commit que audita, do catálogo
deste documento e de nada mais.

```bash
node scripts/audit-report.mjs                # N = 2.000 (critério do contrato)
node scripts/audit-report.mjs --runs 500    # N customizado (tolerância larga)
npm run audit --prefix web                   # equivalente, via npm
```

Cada execução grava em `audit-reports/` (fora do versionamento) um **JSON
estruturado** e um **PDF legível** com a identidade completa da auditoria:

| Campo | Origem |
|---|---|
| `meta.gitCommit` / `gitBranch` / `gitSubject` / `gitDirty` | `git` no momento da execução |
| `meta.webVersion` / `nodeVersion` | `web/package.json` e runtime |
| `meta.generatedAtUtc` | carimbo UTC (único campo fora do digest) |
| `meta.seedBase` + `seedBaseSha256` | semente pública da simulação |
| `meta.historySeedVersion` + `historySeedSha256` + `historySeedFiles` | procedência do seed embutido (`web/src/data/history/`, SHA-256 da concatenação canônica) |
| `monteCarlo[]` | FPR medido, IC de Wilson 95%, limite e veredito por método |
| `probe` | a sonda mal calibrada — reprovar é obrigatório |
| `deferred[]` | métodos monte-carlo ainda não medidos nesta execução (só abaixo do gate, N < 2.000); no gate a lista nasce vazia |
| `exact[]` | recomputação independente dos métodos exatos |
| `meta.contentSha256` | digest do conteúdo determinístico |

A recomputação independente dos exatos usa **outra via matemática**, não os
mesmos números: `prizeProbabilities` das três loterias é recalculado com
aritmética inteira exata (BigInt) faixa a faixa, e o fechamento
C(10, 6, 3) é verificado por uma varredura própria dos 120 subconjuntos, com
controle negativo (um design quebrado precisa ser rejeitado pelas duas vias).

**Verificação de integridade**: o `contentSha256` cobre tudo, exceto o carimbo
UTC. Regenere o relatório no mesmo commit e compare o digest — igual byte a
byte significa mesmos históricos, mesmas medições, mesmos vereditos.

**Critério aplicado conforme o N**: com `runs >= 2000` (gate do contrato) vale
a tolerância estrita (α + 2 p.p.); abaixo disso, a da fumaça (α + 5 p.p.) — em
N pequeno o IC de Wilson é largo e reprovar é comportamento correto, não defeito.

**Código de saída**: `0` quando todos os métodos medidos passam, os exatos
confirmam e a sonda falha (como deve); `1` em violação do contrato; `2` em erro
de ambiente. É esse comando que o gate de CI (Fase 3, abaixo) agenda como job
bloqueante.

## Gate de CI (Fase 3)

O gate é o mesmo comando do relatório de auditoria com o N do contrato — e
com N ≥ 2.000 o relatório mede o **catálogo inteiro** de métodos
`monte-carlo`, inclusive o `walkForwardMulti` que abaixo do gate fica
declarado em `deferred[]` por custo (ver `gateIncludesDeferred`, em
`auditReport.ts`):

```bash
node scripts/audit-report.mjs          # N = 2.000, tolerância estrita (2 p.p.)
npm run audit --prefix web             # equivalente, via npm
```

O workflow `.github/workflows/calibration.yml` agenda esse comando como job
**bloqueante**: semanal (segundas-feiras, 03:00 UTC), a cada release
publicada e sob demanda (`workflow_dispatch`). O JSON e o PDF da execução
ficam como artefato por 90 dias — inclusive quando o gate reprova, para
diagnóstico e reprodução. Nota do GitHub: o cron só dispara depois que a
branch com o workflow chega à `main`.

### Adaptador do walk-forward no gate

O `multiCutWalkForward` da UI usa primeiro corte a 4 anos (o histórico real
da Mega-Sena tem ~30 anos). O histórico honesto do harness tem 400 concursos
espaçados de 3 dias (~3,3 anos) — com o padrão da UI não haveria nenhum
corte. O adaptador do gate (`runner.ts`) espelha os demais parâmetros da
tela (`stepMonths` = 6, `minValidation` = 15) e declara a única exceção:
`firstCutoffYears = 1` — 5 cortes com janela de treino crescente e validação
≥ 15 concursos cada (`WALK_FORWARD_CUT_CONFIG`, exportado).

A afirmação calibrada é a do catálogo: **significância por corte com
correção de Bonferroni pelo nº de cortes** — o adaptador sinaliza quando
algum corte mostra vantagem/desvantagem significativa APÓS a correção; sob
H0, Bonferroni garante família ≤ α.

Reprodutibilidade: o RNG do backtest dentro do adaptador usa semente fixa
pública (`WALK_FORWARD_BACKTEST_SEED = 20261029`; a tela usa
`defaultRandom`, aceitável na interface, não numa medição registrada). O
RNG só dirige geração de jogos e simulação de pesos: os jogos dependem só
da janela de treino, nunca da validação, e o nível do teste binomial por
corte se preserva.

### Resultado da Fase 3 (N = 2.000, semente 20261028)

| Método | FPR medido | IC 95% | Limite | Veredito |
|---|---|---|---|---|
| numberEvidence (dezenas) | 2,8% | [2,1; 3,6] | 7% | PASS |
| numberEvidence (trevos) | 3,0% | [2,4; 3,9] | 7% | PASS |
| collisionTest | 0,1% | [0,0; 0,4] | 7% | PASS |
| frequencyFairnessTest | 3,5% | [2,8; 4,5] | 7% | PASS |
| chiSquareGlobal (numberEvidence) | 3,5% | [2,8; 4,5] | 7% | PASS |
| walkForwardMulti (stabilityAnalysis) | 0,3% | [0,1; 0,7] | 7% | PASS |
| sonda (α = 0,5) | 49,6% | — | 7% | FAIL (esperado) |

Execução completa em ~82 s (Node 20). O walk-forward é conservador no
comprimento honesto — o p-valor binomial exato por corte é discreto e as
janelas de validação geram poucas apostas —, o mesmo padrão do
`collisionTest` na Fase 1: FPR bem abaixo do α é seguro (falso alarme é o
risco que o contrato limita); potência e eficácia exibida ao usuário são
tema da Fase 4.

## Regras de governança

1. **Alterar `alpha`** de qualquer método exige pull request dedicado com
   recalibração completa (gate com N = 2.000 verde) e atualização deste
   documento e da tabela acima.
2. **Incluir método** no catálogo exige adaptador em
   `runner.ts#CALIBRATION_SIGNALS` (o teste de cobertura do contrato falha
   caso contrário) e medição na mesma PR, ou justificativa `smoke: false` com
   entrada no gate de CI.
3. **Método que violar o contrato** recebe rótulo "exploratório" e sai da
   interface até recalibração — a promessa exibida ao usuário é mínima e
   sempre verificável.
4. O **relatório de auditoria reciclável** (Fase 2) e o **gate de CI**
   (Fase 3) consomem este catálogo diretamente; nunca duplicam seus valores.
