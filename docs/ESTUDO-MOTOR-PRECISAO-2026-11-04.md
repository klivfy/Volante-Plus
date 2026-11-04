# Estudo do motor de precisão — lote de 4 jogos e a meta de 49,99% (2026-11-04)

Estudo solicitado: aprimorar o motor que conecta o gerador de números ao
backtesting, com pesquisa de novos modelos matemáticos/probabilísticos/estatísticos,
objetivo declarado de levar a **chance real do lote de 4 jogos** (ao menos o prêmio
mínimo) acima de **49,99%**. Este documento mede o estado atual, valida cada número
contra fontes oficiais e contra o próprio motor do app, e termina com um plano de
ação de implementação. Todos os cálculos foram feitos com código exato (frações
racionais, sem aproximação) e estão reproduzíveis (anexo A).

## 1. Tradução do pedido em métrica formal

A métrica em questão é o painel **"Chance real do lote"** (`BatchOddsPanel`,
alimentado por `src/engine/batchOdds.ts`): **P(≥1 dos jogos do lote premiado em
qualquer faixa)** no próximo concurso. Valores atuais com 4 bilhetes simples
(medidos executando o próprio `batchOdds.ts` via esbuild+node, e reconfirmados
aqui por DP independente):

| Modalidade | P atual (4 bilhetes simples) | Custo |
|---|---|---|
| Mega-Sena | 0,17% (1 em 574) | R$ 24 |
| Quina | 11,52% (1 em 8,7) | R$ 12 |
| +Milionária | 32,78% (1 em 3,05) | R$ 24 |

O "~30%" relatado é a +Milionária. **Importante:** esse número não é uma
superestimativa — é o teto **exato** calculado por enumeração de partições
(hipergeométrica multivariada), validado por Monte Carlo no `assertiveness/cli.ts`.

## 2. O que a matemática permite (e o que não permite)

**Teorema da invariância (já registrado em `docs/refinamento-estatistico.md`):**
nenhum algoritmo de escolha de números muda a probabilidade de um bilhete simples
acertar — todos os C(50,6)=15.890.700 conjuntos são equiprováveis. Portanto o
motor **não pode** ganhar precisão "escolhendo melhor os números". O que muda a
P(≥1 prêmio do lote) é a **estrutura do lote**: quantidade de bilhetes, dezenas
por bilhete (aposta expandida — Caixa permite Mega 6–20, Quina 5–15, +Mili 6–12),
alocação de trevos por bilhete (+Mili) e sobreposição entre bilhetes. Este estudo
sistematiza exatamente essa alavanca — com DP exato e busca otimizada — em vez de
re-propor modelos de previsão (vetados pelos contratos do repositório).

Fontes oficiais (consultadas em 04/11/2026): páginas da CAIXA de +Milionária
(tabelas de preços e probabilidade das 10 faixas, apostas 6–12 dezenas × 2–6
trevos), Quina (preços 5–15 dezenas; probabilidades por faixa) e Mega-Sena
(aposta 6–20 dezenas, R$ 6,00); e *Lottery wheeling* (Wikipedia) para a teoria de
covering designs — a mesma família matemática já usada pelo `closureDesigner`.

## 3. Metodologia

1. **DP exato de partições** (`scripts/lotto_study2.py`): generalização do método
   do `batchOdds.ts` para bilhetes de tamanhos variáveis e trevos por bilhete.
   Frações exatas (`Fraction`) em todos os caminhos.
2. **Validação A (25/25 OK):** para bilhete único da +Milionária, a soma exata
   das 10 faixas bate com o DP para todas as combinações 6..12 × 2..6
   (diferença < 1e-12). As tabelas oficiais da Caixa arredondam ("1 em 15" para
   1 em 14,63; "1 em 6" para 1 em 6,12) — por isso a validação é por fórmula
   exata, não pela soma dos arredondamentos.
3. **Validação B (OK):** o DP de lote de 4 bilhetes simples reproduz o motor real:
   Mega 0,17% e Quina 11,52% (idênticos ao `batchOdds.ts`).
4. **Busca otimizada:** exaustão canônica das alocações de trevos (multiconjuntos
   de subconjuntos) e varredura de tamanhos mistos de dezenas por bilhete
   (n1≥n2≥n3≥n4), maximizando P dado o custo.

## 4. Resultados — a meta 49,99% com 4 bilhetes

### 4.1 +Milionária — META ATINGIDA com R$ 240/concurso

| Design (4 bilhetes) | P(≥1 prêmio) | Custo/concurso |
|---|---|---|
| 4 × (6+2) — atual do app | 32,78% (app) / **32,99%** (trevos otimizados) | R$ 24 |
| 4 × (6+3) | 42,61% | R$ 72 |
| 4 × (6+4) | 48,54% | R$ 144 |
| **4 × (6+5)** | **51,51% ✓** | **R$ 240** |
| 4 × (7+3) | 54,23% | R$ 504 |
| 4 × (8+2) | 52,15% | R$ 672 |
| 4 × (9+5) | 86,03% | R$ 20.160 |

Com 24 dezenas cobertas (4×6), o **teto estrutural é 51,51%** — o design (6+5)
atinge o teto porque com 5 trevos marcados P(≥1 trevo certo por bilhete)=100%,
sobrando só a restrição de dezenas. Intuições falham sem otimização: 4×(8+2)
custa 2,8× mais e entrega menos P que 4×(6+5); e 4×(7+2) (R$ 168) entrega menos
que 4×(6+3) (R$ 72).

**Padrões ótimos de trevos (descoberta do estudo):** a alocação
`{1,2,3} {1,4,5} {2,4,6} {3,5,6}` — cada trevo em exatamente 2 bilhetes, cada par
de trevos coberto o mais uniformemente possível (estrutura "tetraédrica") — é a
ótima para 6+3 e 7+3. Para 6+2: `{1,2} {1,3} {4,5} {4,6}`. O gerador atual
(`ECONOMICO`, dedup de duplas) fica 0,21 p.p. abaixo do ótimo no lote de R$ 24:
ganho real, porém modesto — o valor grande está nos designs expandidos.

### 4.2 Quina — META ATINGIDA com R$ 5.904/concurso (design misto)

| Design (4 bilhetes, dezenas disjuntas) | P(≥1 duque ou mais) | Custo |
|---|---|---|
| 4 × 5 — atual | 11,52% | R$ 12 |
| 4 × 8 | 28,92% | R$ 672 |
| 4 × 10 | 42,76% | R$ 3.024 |
| 4 × 11 uniforme | 49,94% (0,05 p.p. abaixo da meta) | R$ 5.544 |
| **[12, 11, 11, 10] misto** | **50,05% ✓** | **R$ 5.904** |
| 4 × 12 | 57,13% | R$ 9.504 |
| 4 × 15 | 77,44% | R$ 36.036 |

O design misto (um bilhete de 12 + dois de 11 + um de 10) vence o uniforme de 11
dezenas com +R$ 360: é a prova de que o otimizador por custo agrega sobre designs
"redondos". (Preços oficiais: Quina R$ 3,00 × C(n,5).)

### 4.3 Mega-Sena — meta INVIÁVEL com 4 bilhetes (resultado honesto)

Faixa mínima = quadra (4 acertos), P=0,0283% por bilhete simples. Busca exaustiva
sobre todos os designs de 4 bilhetes (6–20 dezenas, Σ≤60):

| Design | P(≥1 quadra+) | Custo |
|---|---|---|
| 4 × 6 — atual | 0,17% | R$ 24 |
| 4 × 15 | 11,92% | R$ 120.120 |
| [20, 20, 14, 6] (cobre as 60 dezenas) | **20,03% = teto de 4 bilhetes** | R$ 483.144 |

Nenhum design de 4 bilhetes atinge 49,99% — **impossível na Mega-Sena com 4
jogos**, por mais caro que seja o design. Referência de escala: ~2.445 bilhetes
simples (≈ R$ 14.670/concurso) para ~50% de quadra, com EV fortemente negativo
(prêmio típico da quadra ≈ R$ 500–1.000). A recomendação para a Mega é exibir o
teto honesto e não oferecer o modo otimizado com promessa acima dele.

### 4.4 Sobreposição entre bilhetes

Teste controlado ([7,7,5,5] vs [6,6,6,6], mesma cobertura líquida): a
sobreposição **não** supera a disjunção quando o orçamento é gasto em bilhetes
maiores disjuntos — os designs ótimos encontrados são todos disjuntos. O motor
atual (`usedNumbersGlobal`, dedup absoluto) já produz lotes disjuntos: **correto
e mantido**. Sobreposição fica documentada como espaço aberto, com a evidência
numérica acima contrária ao seu uso.

## 5. Modelos avaliados na pesquisa (e o veredito para este motor)

| Modelo | Fonte | Veredito |
|---|---|---|
| Covering designs / lottery wheeling | Wikipedia (Lottery wheeling); La Jolla Covering Repository | Já implementado no `closureDesigner` (C(v,6,t)); o novo contribution é o **otimizador de lote heterogêneo** (tamanhos variáveis × trevos), que não existe no repo |
| DP hipergeométrico multivariado para união de prêmios | mesma base do `batchOdds.ts` | **Adotar** — estender a tamanhos variáveis e trevos (Fase F1) |
| Otimização de alocação de trevos (set-system balanceado) | novo (derivação deste estudo) | **Adotar** — +0,21 p.p. no lote simples; estruturas "tetraédricas" |
| Calibração de estimadores (Brier/ECE) | literatura de forecasting | **Adotar como métrica do backtest de designs** (o repo hoje só tem FPR/Wilson) — mede se o P exibido acerta a frequência real |
| EV pari-mutuel / impopularidade (split de prêmios) | `unpopularity.ts`, `payoutShare.ts` | Já implementado — integra ao design como desempate, não como promessa de chance |
| Modelos de previsão/seleção de números (qualquer) | teorema da invariância | **Vetado** — contratos do repo; nenhuma melhoria de P por escolha de números |
| Baterias NIST/Diehard, Ljung-Box | `metodos-estatisticos-adicionais.md` | Continuam vetados (razões registradas) |

## 6. PLANO DE AÇÃO DE IMPLEMENTAÇÃO

**Fase F1 — Motor matemático do lote (núcleo, sem UI)**
- `src/engine/loteOptimizer.ts`: DP de partições (tamanhos variáveis × trevos por
  bilhete) com `bigint`/frações exatas; busca por orçamento (tamanhos mistos +
  exaustão canônica de trevos); API: `optimizeBatch(lottery, budgetBrl, games=4)` →
  `{ design, exactProbability: {num, den}, costBrl }`.
- Testes: fixtures com os valores deste estudo (32,99% / 51,51% / 50,05% /
  teto Mega 20,03%) travados como frações exatas; propriedade de monotonicidade
  (mais orçamento ⇒ P não cai); tolerância DP×Monte Carlo 10^6 < 1e-9.

**Fase F2 — Geração do design (integração com o gerador atual)**
- `src/engine/loteDesign.ts`: materializa o design em jogos concretos — dezenas
  disjuntas escolhidas pelo `gameGenerator` (tiers/impopularidade como desempate
  interno — sem promessa de chance, só EV condicional) + trevos do padrão ótimo
  (tetraédrico etc.); valida disjunção e cobertura com `verifyClosure` adaptado.
- Backtesting do design (`backtestDesigns.ts`): replay no histórico real —
  frequência observada de "lote premiado" vs P exata (IC de Wilson), por loteria.

**Fase F3 — UI "Lote Otimizado" (home)**
- Terceiro modo ao lado de Normal/Fechamento: usuário escolhe **orçamento por
  concurso**; o painel mostra design (nº de dezenas por bilhete + trevos),
  **P exata** (fração e %), custo, comparação com o lote simples e o disclaimer
  do jogador responsável. Mega-Sena: mostra o teto e explica por que não há
  modo otimizado (§4.3).
- `BatchOddsPanel` estendido para lotes heterogêneos (novas células de Venn).

**Fase F4 — Calibração e guardrails (contratos do repo)**
- Novo método no catálogo de calibração (`calibration/catalog.ts`): validador
  DP×MC do lote otimizado (α=0,05; fumaça N=300 em PR, gate N=2.000 semanal).
- Métricas Brier/ECE registradas no relatório de backtest de designs.
- `docs/` atualizados: este estudo + `metodos-estatisticos-adicionais.md`
  (seção "lote otimizado").

**Fase F5 — Paridade e CI**
- Golden fixtures novas com frações exatas do DP (BigInt reduzido) — mesmo o
  modo web-only precisa das fixtures canônicas; Kotlin: expor o otimizador em
  `shared/` ou registrar deliberadamente como web-only (padrão dos módulos
  fora da UI) com justificativa no doc de paridade.
- Gate de Lighthouse: novo painel deve entrar lazy (`dynamic()`) para não piorar
  o TBT (ver `docs/AUDITORIA-PERFORMANCE-2026-11-04.md`).

**Critérios de aceite**
1. `loteOptimizer` reproduz exatamente os 4 valores-fixture deste estudo.
2. Backtest de designs: P exata dentro do IC de Wilson dos concursos reais.
3. Gate de calibração (N=2.000) verde; sonda continua reprovando.
4. Suíte atual (788 testes) + novas suítes verde; Lighthouse a11y 1,0 mantido.
5. UI nunca exibe probabilidade acima do teto exato do design — teste de UI.

**Riscos e mitigações**
- Preços da Caixa mudam → tabela de preços em um único ponto (`prizeRules` já
  centraliza) + nota "confira o valor vigente" (padrão existente).
- Expectativa do usuário ("chance de ganhar") → UI sempre em termos de
  "chance de ≥1 prêmio na faixa mínima ou melhor, neste concurso", com custo
  explícito e EV negativo visível (jogador responsável / LGPD).
- Complexidade do DP no cliente → cálculo no worker de backtest (infra já existe
  com gate `requestId`); designs pré-computados para orçamentos típicos.

## 7. Conclusão executiva

1. A chance real de 4 jogos **não depende de quais números** o motor sugere —
   depende da estrutura do lote. O motor atual já está no teto do design que
   oferece (simples disjuntos) e reporta a probabilidade exata.
2. A meta de 49,99% **é atingível** com 4 bilhetes: **+Milionária 4×(6+5) =
   51,51% por R$ 240/concurso** (design ótimo; teto estrutural do lote) e
   **Quina [12,11,11,10] = 50,05% por R$ 5.904**. Na **Mega-Sena é
   matematicamente inviável com 4 bilhetes** (teto ≈ 20,03% custando R$ 483 mil).
3. O aperfeiçoamento do motor proposto é **honesto por construção**: otimizador
   de lote com probabilidade exata, validado por Monte Carlo e pelo histórico,
   dentro dos contratos de calibração do repositório — sem nenhum modelo de
   previsão vetado.

## Anexo A — reproduzir

```bash
cd /home/z/my-project/scripts
python3 lotto_study2.py    # validações A/B + buscas (Mega, Quina)
python3 trevo_best.py      # alocações ótimas de trevos por design
# conferência contra o motor real do app (4 bilhetes simples):
# batchOdds.ts executado via esbuild+node na sessão de estudo (32,78% +Mili etc.)
```

Fontes oficiais: `loterias.caixa.gov.br/Paginas/mais-milionaria.aspx` (tabelas de
preços e probabilidade, 6–12 dezenas × 2–6 trevos),
`.../Paginas/Quina.aspx` (preços 5–15 dezenas, probabilidades por faixa),
`.../Paginas/Mega-Sena.aspx` (6–20 dezenas, R$ 6,00);
`en.wikipedia.org/wiki/Lottery_wheeling` (covering designs). Tabelas oficiais
arredondam os "1 em X" — a validação deste estudo é por fórmula exata.
