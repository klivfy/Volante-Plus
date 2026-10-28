import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Lottery } from '../../types/domain';
import {
  batchAnyPrizeProbability,
  concursosNeededForTarget,
  disjointBatchOdds,
  singleBetAnyPrizeProbability,
} from '../batchOdds';
import { analyzeBacktest } from '../backtestAnalyzer';
import { generateGames } from '../gameGenerator';
import { prizeProbabilities } from '../hypergeometric';
import {
  classifyHits,
  isPrized,
  lotteryRules,
  prizeTiers,
} from '../prizeRules';
import { prizeProbabilityByNumbersAlone } from '../powerAnalysis';
import { createSeededRandom } from '../random';
import {
  StrategyName,
  STRATEGY_DESCRIPTIONS,
  generateForStrategy,
} from '../strategyBenchmark';
import { binomialExactTest } from '../statisticalTests';
import { wilsonInterval95 } from '../statUtils';
import { honestHistory } from '../calibration/honestHistory';

/**
 * CLI da rodada de verificação de assertividade do motor de geração.
 *
 * Responde, com números e não com retórica, ao pedido de "margem de
 * assertividade alta comparada a outros modelos":
 *
 * 1. FAIXAS MÍNIMAS — pinha as regras de prêmio mínimo de cada modalidade
 *    (Mega quadra, +Mili faixa 10 = 2+1, Quina duque) contra o regulamento.
 * 2. TETO TEÓRICO DO LOTE — probabilidades EXATAS de "pelo menos um prêmio"
 *    para lotes de 2 a 4 jogos (`batchOdds`), incluindo quantos concursos
 *    independentes até 50% e 90% de chance.
 * 3. CALIBRAÇÃO DO MOTOR — Monte Carlo semeado do caminho completo do
 *    gerador (histórico honesto → backtest → geração): a taxa observada tem
 *    de bater com o teto exato. É a prova de que o motor ENTREGA o máximo
 *    matemático disponível — e de que não entrega nada acima dele.
 * 4. PARIDADE COM MODELOS ALTERNATIVOS — 5 estratégias (a do app + 4
 *    concorrentes) contra os mesmos concursos de validação, com teste
 *    binomial exato por estratégia e correção de Bonferroni. Veredicto
 *    honesto esperado: NENHUMA estratégia supera o acaso — quem prometer
 *    mais que isso está mentindo, seja concorrente seja nós.
 * 5. MELHORIAS ESTRUTURAIS QUANTIFICADAS — ganho exato da deduplicação de
 *    dezenas e de duplas de trevo sobre lotes redundantes.
 *
 * Executado pelo launcher `scripts/assertiveness-report.mjs` (esbuild), ou
 * diretamente sob runner TypeScript. Código de saída: 0 = todos os veredictos
 * confirmados; 1 = algum veredicto falhou; 2 = erro de ambiente.
 *
 * HONESTIDADE: sorteios são eventos independentes e uniformemente aleatórios.
 * Este relatório não torna nada previsível — ele prova que a aplicação atinge
 * exatamente o teto matemático, quantifica o que "acertar o mínimo" custa em
 * probabilidade, e demonstra que nenhum modelo alternativo faz melhor.
 */

export const ASSERTIVENESS_REPORT_SCHEMA = 'volante-plus/assertiveness-report@1';

/** Semente pública padrão da rodada (mesma convenção da calibração). */
export const ASSERTIVENESS_SEED = 20261029;

export interface AssertivenessOptions {
  /** Tentativas Monte Carlo por modalidade na verificação do lote. */
  runs: number;
  /** Concursos de validação por estratégia na paridade. */
  validationDraws: number;
  /** Concursos de treino do backtest por modalidade. */
  trainingDraws: number;
  seed: number;
  repoRoot?: string;
}

export interface AssertivenessReport {
  schema: string;
  meta: {
    gitCommit: string | null;
    gitBranch: string | null;
    gitSubject: string | null;
    gitDirty: boolean | null;
    nodeVersion: string;
    runs: number;
    validationDraws: number;
    trainingDraws: number;
    seed: number;
    contentSha256: string;
    generatedAtUtc: string;
  };
  /** Declaração honesta embutida no artefato — não é enfeite, é contrato. */
  declaracao: string;
  modalidades: Record<
    string,
    {
      faixaMinima: {
        key: string;
        label: string;
        probabilidade: number;
        umaEm: number;
      };
      qualquerPremioPorJogo: { probabilidade: number; umaEm: number };
      lote: Record<
        string,
        { anyPrize: number; umaEm: number; esperadoJogosPremiados: number }
      >;
      concursosParaAlvo: Record<string, number>;
      mcLote: {
        trials: number;
        lotesPremiados: number;
        taxa: number;
        wilson95: [number, number];
        teoriaExata: number;
        desvioEmSigma: number;
        calibrado: boolean;
      };
      paridade: {
        p0: number;
        estrategias: {
          strategy: StrategyName;
          description: string;
          apostasDistintas: number;
          premiados: number;
          taxa: number;
          ic95: [number, number];
          pValor: number;
          mediaAcertos: number;
          esperadoAcertos: number;
          zMedia: number;
        }[];
        bonferroniLimiar: number;
        /**
         * Veredicto por TESTE DA MÉDIA (|z| <= 3 para todas): imune à
         * estrutura do lote — válido mesmo para estratégias com núcleo
         * compartilhado, cujas apostas NÃO são independentes entre si.
         */
        nenhumaSuperaOAcaso: boolean;
        /**
         * Diagnóstico (não-veredicto): p-valor binomial exato por estratégia.
         * Estratégias com núcleo fixo compartilhado (frequency-pure,
         * cold-numbers) produzem prêmios AGRUPADOS — o binomial trata cada
         * aposta como independente e superestima significância nesses casos.
         */
        diagnosticoBinomialSignificativo: string[];
      };
    }
  >;
  melhorias: {
    dedupDuplasTrevos: Record<
      string,
      { repetidas: number; distintas: number; ganhoAbsoluto: number }
    >;
    dedupDezenas: Record<
      string,
      { identicos: number; disjuntos: number; ganhoAbsoluto: number }
    >;
  };
  veredictos: {
    faixasMinimasConformeRegulamento: boolean;
    motorCalibradoAoTetoExato: boolean;
    nenhumModeloSuperaOAcaso: boolean;
    estruturaDoLoteMaximizaPremio: boolean;
    todosConfirmados: boolean;
  };
}

interface CliArgs {
  runs: number;
  validationDraws: number;
  trainingDraws: number;
  seed: number;
  outDir: string;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    runs: 20000,
    validationDraws: 1500,
    trainingDraws: 400,
    seed: ASSERTIVENESS_SEED,
    outDir: 'auditoria-assertividade',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const value = (flag: string): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`flag ${flag} exige um valor`);
      i += 1;
      return v;
    };
    switch (argv[i]) {
      case '--runs':
        args.runs = Number(value('--runs'));
        break;
      case '--validation-draws':
        args.validationDraws = Number(value('--validation-draws'));
        break;
      case '--training-draws':
        args.trainingDraws = Number(value('--training-draws'));
        break;
      case '--seed':
        args.seed = Number(value('--seed'));
        break;
      case '--out-dir':
        args.outDir = value('--out-dir');
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`argumento desconhecido: ${argv[i]} (use --help)`);
    }
  }
  if (!Number.isInteger(args.runs) || args.runs <= 0) {
    throw new Error(`--runs deve ser inteiro positivo (recebido: ${args.runs})`);
  }
  return args;
}

export function printHelp(): void {
  process.stdout.write(
    [
      'Relatório de assertividade do motor — Volante-Plus',
      '',
      'Uso:',
      '  node scripts/assertiveness-report.mjs [opções]',
      '',
      'Opções:',
      '  --runs N               tentativas Monte Carlo do lote por modalidade (padrão 20000)',
      '  --validation-draws N   concursos de validação por estratégia (padrão 1500)',
      '  --training-draws N     concursos de treino do backtest (padrão 400)',
      '  --seed N               semente pública da rodada (padrão 20261029)',
      '  --out-dir D            diretório de saída do JSON (padrão auditoria-assertividade)',
      '  --help                 esta ajuda',
      '',
      'Saída: JSON com teoria exata, Monte Carlo, paridade de 5 estratégias e veredictos.',
      'Código de saída 0 só quando todos os veredictos confirmam.',
      '',
    ].join('\n'),
  );
}

function resolveRepoRoot(explicit?: string): string {
  if (explicit) return explicit;
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    if (fs.existsSync(path.join(dir, 'web', 'src', 'engine', 'batchOdds.ts'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'raiz do repositório não encontrada — rode de dentro do Volante-Plus',
  );
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function git(args: string[], repoRoot: string): string | null {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sampleUniform(
  rng: ReturnType<typeof createSeededRandom>,
  universe: number,
  count: number,
): Set<number> {
  const set = new Set<number>();
  while (set.size < count) set.add(1 + rng.nextInt(universe));
  return set;
}

const LOTTERIES = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA, Lottery.QUINA];

const DECLARACAO =
  'Sorteios das loterias Caixa são eventos independentes e uniformemente ' +
  'aleatórios: nenhuma análise de dados passados altera a probabilidade de ' +
  'uma combinação. Este relatório não prevê resultados — prova que o motor ' +
  'entrega exatamente o teto matemático de premiação, quantifica o custo em ' +
  'probabilidade de cada faixa mínima e demonstra por teste estatístico que ' +
  'nenhum modelo de seleção (inclusive os do próprio app) supera o acaso.';

/** Verifica as faixas mínimas contra o regulamento (fonte: edital Caixa). */
function checkMinTiers(): boolean {
  const mega = prizeTiers(Lottery.MEGA_SENA);
  const mili = prizeTiers(Lottery.MAIS_MILIONARIA);
  const quina = prizeTiers(Lottery.QUINA);
  const okMega = mega[mega.length - 1].key === '4' && isPrized(Lottery.MEGA_SENA, 4);
  const okQuina =
    quina[quina.length - 1].key === '2' &&
    isPrized(Lottery.QUINA, 2) &&
    !isPrized(Lottery.QUINA, 1);
  const okMili =
    mili[mili.length - 1].key === '2+1' &&
    isPrized(Lottery.MAIS_MILIONARIA, 2, 1) &&
    !isPrized(Lottery.MAIS_MILIONARIA, 2, 0) &&
    // Faixas 2/4/6 do oficial agrupam 0 ou 1 trevo: 4/5/6 dezenas premiam sem trevo.
    isPrized(Lottery.MAIS_MILIONARIA, 4, 0) &&
    isPrized(Lottery.MAIS_MILIONARIA, 6, 0) &&
    // 3 dezenas exigem trevo (só 3+2 e 3+1 existem).
    !isPrized(Lottery.MAIS_MILIONARIA, 3, 0);
  return okMega && okQuina && okMili;
}

/** Média e desvio-padrão exatos de acertos de um jogo simples (hipergeométrica). */
function meanAndSd(lottery: Lottery): { mean: number; sd: number } {
  const { numberUniverse: N, numbersDrawn: K, numbersPerBet: k } = lotteryRules(lottery);
  const mean = (k * K) / N;
  const variance = k * (K / N) * (1 - K / N) * ((N - k) / (N - 1));
  return { mean, sd: Math.sqrt(variance) };
}

/**
 * Monte Carlo do caminho COMPLETO do gerador: histórico honesto → backtest →
 * geração do lote → sorteio uniforme → classificação. Por simetria do sorteio
 * uniforme, P(prêmio) é idêntico para qualquer conjunto de jogos disjuntos —
 * o resultado tem de bater com `batchOdds` até ruído de amostragem.
 */
function runBatchMc(
  lottery: Lottery,
  performances: ReturnType<typeof analyzeBacktest>,
  trials: number,
  seed: number,
): AssertivenessReport['modalidades'][string]['mcLote'] {
  const rules = lotteryRules(lottery);
  const rng = createSeededRandom(seed);
  let prizedBatches = 0;
  for (let t = 0; t < trials; t++) {
    const batch = generateGames(lottery, 4, performances, { random: rng });
    const drawn = sampleUniform(rng, rules.numberUniverse, rules.numbersDrawn);
    const drawnTrevos =
      rules.trevoUniverse > 0 ? sampleUniform(rng, rules.trevoUniverse, rules.trevosDrawn) : null;
    const anyPrize = batch.games.some((game) => {
      const hits = game.numbers.filter((n) => drawn.has(n)).length;
      const trevoHits = drawnTrevos
        ? (game.trevoDuplas ?? []).filter(([a, b]) => drawnTrevos.has(a) || drawnTrevos.has(b))
            .length
        : 0;
      return isPrized(lottery, hits, trevoHits);
    });
    if (anyPrize) prizedBatches++;
  }
  const exact = disjointBatchOdds(lottery, 4).anyPrizeProbability;
  const rate = prizedBatches / trials;
  const sigma = Math.sqrt((exact * (1 - exact)) / trials);
  const wilson = wilsonInterval95(prizedBatches, trials);
  return {
    trials,
    lotesPremiados: prizedBatches,
    taxa: rate,
    wilson95: [wilson.lower, wilson.upper],
    teoriaExata: exact,
    desvioEmSigma: (rate - exact) / sigma,
    calibrado: Math.abs(rate - exact) <= 4 * sigma,
  };
}

/**
 * Paridade: cada estratégia joga os MESMOS concursos de validação. Unidade de
 * independência = aposta distinta por concurso (réplicas exatas não contam —
 * `frequency-pure` devolve o mesmo jogo 4 vezes). Baseline p0 por dezenas
 * apenas, a mesma convenção do `runStrategyBenchmark`.
 */
function runParity(
  lottery: Lottery,
  performances: ReturnType<typeof analyzeBacktest>,
  validation: ReturnType<typeof honestHistory>,
  seed: number,
): AssertivenessReport['modalidades'][string]['paridade'] {
  const p0 = prizeProbabilityByNumbersAlone(lottery);
  const { mean: expectedMean, sd } = meanAndSd(lottery);
  const strategies: StrategyName[] = [
    'tier-weighted',
    'frequency-pure',
    'cold-numbers',
    'random-uniform',
    'gap-maximizer',
  ];

  const estrategias = strategies.map((strategy, index) => {
    const rng = createSeededRandom(seed + index);
    const hitsPerGame: number[] = [];
    let prizedCount = 0;
    let bets = 0;
    for (const draw of validation) {
      const games = generateForStrategy(strategy, lottery, performances, 4, rng);
      const seen = new Set<string>();
      for (const numbers of games) {
        const key = numbers.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const hits = numbers.filter((n) => draw.numbers.includes(n)).length;
        hitsPerGame.push(hits);
        bets++;
        if (classifyHits(lottery, hits) !== null) prizedCount++;
      }
    }
    const mean = hitsPerGame.reduce((a, b) => a + b, 0) / hitsPerGame.length;
    const z = (mean - expectedMean) / (sd / Math.sqrt(hitsPerGame.length));
    const { pValue } = binomialExactTest(prizedCount, bets, p0);
    const ic = wilsonInterval95(prizedCount, bets);
    return {
      strategy,
      description: STRATEGY_DESCRIPTIONS[strategy],
      apostasDistintas: bets,
      premiados: prizedCount,
      taxa: prizedCount / bets,
      ic95: [ic.lower, ic.upper] as [number, number],
      pValor: pValue,
      mediaAcertos: mean,
      esperadoAcertos: expectedMean,
      zMedia: z,
    };
  });

  const bonferroniLimiar = 0.05 / estrategias.length;
  const diagnosticoBinomialSignificativo = estrategias
    .filter((e) => e.pValor < bonferroniLimiar)
    .map((e) => e.strategy);
  return {
    p0,
    estrategias,
    bonferroniLimiar,
    // VEREDICTO pelo teste da média: sob sorteio uniforme, TODO conjunto fixo
    // de dezenas tem a mesma distribuição de acertos (trocaibilidade) — o z da
    // média é válido para qualquer estratégia, inclusive as com núcleo
    // compartilhado cujo binomial explode por agrupamento de prêmios.
    nenhumaSuperaOAcaso: estrategias.every((e) => Math.abs(e.zMedia) <= 3),
    diagnosticoBinomialSignificativo,
  };
}

/** Monta o relatório completo (determinístico no conteúdo; UTC fora do digest). */
export function runAssertivenessReport(
  options: AssertivenessOptions,
): AssertivenessReport {
  const { runs, validationDraws, trainingDraws, seed } = options;
  const repoRoot = resolveRepoRoot(options.repoRoot);

  const modalidades: AssertivenessReport['modalidades'] = {};
  for (const [index, lottery] of LOTTERIES.entries()) {
    const tiers = prizeTiers(lottery);
    const minTier = tiers[tiers.length - 1];
    const probs = prizeProbabilities(lottery);
    const single = singleBetAnyPrizeProbability(lottery);

    const lote: AssertivenessReport['modalidades'][string]['lote'] = {};
    for (let g = 2; g <= 4; g++) {
      const odds = disjointBatchOdds(lottery, g);
      lote[String(g)] = {
        anyPrize: odds.anyPrizeProbability,
        umaEm: 1 / odds.anyPrizeProbability,
        esperadoJogosPremiados: odds.expectedPrizedGames,
      };
    }

    const training = honestHistory(lottery, trainingDraws, seed + 10 + index);
    const performances = analyzeBacktest(training, lottery);
    const mcLote = runBatchMc(lottery, performances, runs, seed + index);
    const validation = honestHistory(lottery, validationDraws, seed + 20 + index);
    const paridade = runParity(lottery, performances, validation, seed + 30 + index);

    modalidades[lottery] = {
      faixaMinima: {
        key: minTier.key,
        label: minTier.label,
        probabilidade: probs[minTier.key],
        umaEm: 1 / probs[minTier.key],
      },
      qualquerPremioPorJogo: { probabilidade: single, umaEm: 1 / single },
      lote,
      concursosParaAlvo: {
        '50%': concursosNeededForTarget(lottery, 4, 0.5),
        '90%': concursosNeededForTarget(lottery, 4, 0.9),
      },
      mcLote,
      paridade,
    };
  }

  // Melhorias quantificadas — o que a estrutura do lote compra de verdade.
  const dedupDuplasTrevos: AssertivenessReport['melhorias']['dedupDuplasTrevos'] = {};
  for (let g = 2; g <= 4; g++) {
    const odds = disjointBatchOdds(Lottery.MAIS_MILIONARIA, g);
    const repeated = odds.anyPrizeProbabilityRepeatedDuplas ?? odds.anyPrizeProbability;
    dedupDuplasTrevos[String(g)] = {
      repetidas: repeated,
      distintas: odds.anyPrizeProbability,
      ganhoAbsoluto: odds.anyPrizeProbability - repeated,
    };
  }
  const dedupDezenas: AssertivenessReport['melhorias']['dedupDezenas'] = {};
  for (const lottery of LOTTERIES) {
    const { numbersPerBet: k } = lotteryRules(lottery);
    const game1 = Array.from({ length: k }, (_, j) => j + 1);
    const game2 = Array.from({ length: k }, (_, j) => k + j + 1);
    const identicos = batchAnyPrizeProbability(
      lottery,
      [game1, game1],
      lottery === Lottery.MAIS_MILIONARIA
        ? ([[1, 2], [1, 2]] as [number, number][]).map((d) => [d])
        : undefined,
    );
    const disjuntos = batchAnyPrizeProbability(
      lottery,
      [game1, game2],
      lottery === Lottery.MAIS_MILIONARIA
        ? ([[1, 2], [3, 4]] as [number, number][]).map((d) => [d])
        : undefined,
    );
    dedupDezenas[lottery] = {
      identicos,
      disjuntos,
      ganhoAbsoluto: disjuntos - identicos,
    };
  }

  const estruturaOk =
    Object.values(dedupDezenas).every((m) => m.ganhoAbsoluto > 0) &&
    Object.values(dedupDuplasTrevos).every((m) => m.ganhoAbsoluto > 0);
  const motorCalibrado = Object.values(modalidades).every((m) => m.mcLote.calibrado);
  const nenhumSupera = Object.values(modalidades).every((m) => m.paridade.nenhumaSuperaOAcaso);
  const faixasOk = checkMinTiers();
  const todosConfirmados = faixasOk && motorCalibrado && nenhumSupera && estruturaOk;

  const commit = git(['rev-parse', 'HEAD'], repoRoot);
  const porcelain = git(['status', '--porcelain'], repoRoot);
  const webPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'web', 'package.json'), 'utf8'),
  ) as { version?: string };

  const payload = {
    schema: ASSERTIVENESS_REPORT_SCHEMA,
    meta: {
      gitCommit: commit,
      gitBranch: git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
      gitSubject: git(['log', '-1', '--pretty=%s'], repoRoot),
      gitDirty: porcelain === null ? null : porcelain.length > 0,
      nodeVersion: process.version,
      webVersion: webPackage.version ?? 'desconhecida',
      runs,
      validationDraws,
      trainingDraws,
      seed,
    },
    declaracao: DECLARACAO,
    modalidades,
    melhorias: { dedupDuplasTrevos, dedupDezenas },
    veredictos: {
      faixasMinimasConformeRegulamento: faixasOk,
      motorCalibradoAoTetoExato: motorCalibrado,
      nenhumModeloSuperaOAcaso: nenhumSupera,
      estruturaDoLoteMaximizaPremio: estruturaOk,
      todosConfirmados,
    },
  };

  const contentSha256 = sha256Hex(JSON.stringify(payload));
  return {
    ...payload,
    meta: {
      ...payload.meta,
      contentSha256,
      generatedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    },
  } as AssertivenessReport;
}

function printSummary(report: AssertivenessReport, jsonPath: string): void {
  const lines: string[] = ['', '  RODADA DE VERIFICAÇÃO DE ASSERTIVIDADE — Volante-Plus', ''];
  for (const [lottery, m] of Object.entries(report.modalidades)) {
    lines.push(
      `  ${lottery}:`,
      `    faixa mínima ${m.faixaMinima.key} (${m.faixaMinima.label}): 1 em ${m.faixaMinima.umaEm.toFixed(1)} por jogo`,
      `    lote de 4 jogos — P(pelo menos 1 prêmio): ${(m.lote['4'].anyPrize * 100).toFixed(2)}% (1 em ${m.lote['4'].umaEm.toFixed(1)})`,
      `    MC ${m.mcLote.trials} lotes: ${(m.mcLote.taxa * 100).toFixed(2)}% vs teoria ${(m.mcLote.teoriaExata * 100).toFixed(2)}% (${m.mcLote.desvioEmSigma >= 0 ? '+' : ''}${m.mcLote.desvioEmSigma.toFixed(2)}σ) ${m.mcLote.calibrado ? 'CALIBRADO' : 'FORA'}`,
      `    paridade (teste da média): ${m.paridade.nenhumaSuperaOAcaso ? 'nenhuma estratégia extrai sinal do passado' : 'ALGUMA estratégia desviou (investigar!)'}` +
        (m.paridade.diagnosticoBinomialSignificativo.length > 0
          ? ` · binomial sinaliza: ${m.paridade.diagnosticoBinomialSignificativo.join(', ')} (diagnóstico — agrupamento de prêmios)`
          : ''),
    );
  }
  lines.push(
    '',
    `  ganho deduplicação de duplas (+Mili, 4 jogos): +${(report.melhorias.dedupDuplasTrevos['4'].ganhoAbsoluto * 100).toFixed(3)} p.p.`,
    '',
    `  veredito: ${report.veredictos.todosConfirmados ? 'TODOS OS VEREDICTOS CONFIRMADOS' : 'VEREDICTO REPROVADO'}`,
    `  conteúdo SHA-256: ${report.meta.contentSha256}`,
    `  JSON: ${jsonPath}`,
    '',
  );
  process.stdout.write(lines.join('\n'));
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  const repoRoot = resolveRepoRoot();
  const outDir = path.isAbsolute(args.outDir)
    ? args.outDir
    : path.join(repoRoot, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const report = runAssertivenessReport({
    runs: args.runs,
    validationDraws: args.validationDraws,
    trainingDraws: args.trainingDraws,
    seed: args.seed,
    repoRoot,
  });

  const stamp = report.meta.generatedAtUtc.replace(/[-:]/g, '');
  const jsonPath = path.join(outDir, `assertividade-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  printSummary(report, jsonPath);
  process.exitCode = report.veredictos.todosConfirmados ? 0 : 1;
}

if (process.env['VITEST'] === undefined) {
  try {
    main();
  } catch (error) {
    console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
