'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LotterySelector from '@/components/LotterySelector';
import { getDraws } from '@/services/db';
import { Draw, Lottery } from '@/types/domain';
import { calculateEV, kellySimulation, PrizeAverage } from '@/engine/expectedValue';
import { frequencyFairnessTest, gapTest, serialCorrelationTest } from '@/engine/fairnessTests';
import { expectedHitsFor, powerTable } from '@/engine/powerAnalysis';
import { BenchmarkResult, runStrategyBenchmark } from '@/engine/strategyBenchmark';
import { applyWheel, WHEEL_10_6_4 } from '@/engine/wheelingSystems';
import { StabilityAnalysis, WalkForwardCutResult, multiCutWalkForward, stabilityAnalysis } from '@/engine/walkForwardMulti';

const percent = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Tela "Análise Avançada": expõe, sem alterar nenhuma tela existente, os
 * módulos de validação estatística mais rigorosa descritos no documento de
 * extensão (poder estatístico, walk-forward multi-corte, benchmark de
 * estratégias com correção de múltiplas comparações, testes de fairness do
 * próprio sorteio, wheeling systems e EV/Kelly).
 *
 * Cada seção computa sob demanda (botão próprio) — o histórico completo de
 * uma loteria já é leve o bastante para rodar no thread principal, mas o
 * benchmark de estratégias e o walk-forward multi-corte podem levar alguns
 * segundos; o `setTimeout(0)` antes de cada cálculo pesado deixa o spinner
 * pintar antes de bloquear a thread.
 */
export default function AnaliseAvancadaPage() {
  const { t } = useTranslation();
  const [lottery, setLottery] = useState<Lottery>(Lottery.MEGA_SENA);

  return (
    <Container component="main" maxWidth="md" sx={{ py: 3, pb: 10 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {t('advanced.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('advanced.subtitle')}
          </Typography>
        </Box>

        <LotterySelector value={lottery} onChange={setLottery} />

        <PowerAnalysisSection lottery={lottery} />
        <FairnessSection lottery={lottery} />
        <BenchmarkSection lottery={lottery} />
        <WheelingSection />
        <ExpectedValueSection lottery={lottery} />
      </Stack>
    </Container>
  );
}

function SectionAccordion({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

/** Poder estatístico: quanto de vantagem sobre o acaso o app conseguiria detectar. */
function PowerAnalysisSection({ lottery }: { lottery: Lottery }) {
  const { t } = useTranslation();
  const table = powerTable(lottery);
  const sampleSizes = table[0]?.powerBySampleSize.map((row) => row.sampleSize) ?? [];

  return (
    <SectionAccordion title={t('advanced.power.title')} subtitle={t('advanced.power.subtitle')}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('advanced.power.explanation', {
            expected: decimal.format(expectedHitsFor(lottery)),
          })}
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('advanced.power.effect')}</TableCell>
                {sampleSizes.map((n) => (
                  <TableCell key={n} align="right">
                    {n.toLocaleString('pt-BR')}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {table.map((row) => (
                <TableRow key={row.effectSize}>
                  <TableCell>+{decimal.format(row.effectSize)}</TableCell>
                  {row.powerBySampleSize.map((cell) => (
                    <TableCell key={cell.sampleSize} align="right">
                      {percent.format(cell.power)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </SectionAccordion>
  );
}

/** Testes de aleatoriedade do próprio sorteio + walk-forward multi-corte. */
function FairnessSection({ lottery }: { lottery: Lottery }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draws, setDraws] = useState<Draw[] | null>(null);
  const [walkForward, setWalkForward] = useState<WalkForwardCutResult[] | null>(null);

  async function run(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const history = await getDraws(lottery);
      // Defer: deixa o spinner pintar antes do cálculo síncrono pesado.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const cuts = multiCutWalkForward(history, lottery, {}, { stepMonths: 6, minValidation: 15 });
      setDraws(history);
      setWalkForward(cuts);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('advanced.runError'));
    } finally {
      setLoading(false);
    }
  }

  const freq = draws ? frequencyFairnessTest(draws, lottery) : null;
  const serial = draws ? serialCorrelationTest(draws, lottery) : null;
  const gaps = draws ? gapTest(draws, lottery).sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)).slice(0, 5) : null;
  const stability: StabilityAnalysis | null = walkForward ? stabilityAnalysis(walkForward) : null;

  return (
    <SectionAccordion title={t('advanced.fairness.title')} subtitle={t('advanced.fairness.subtitle')}>
      <Stack spacing={2}>
        <Button
          variant="outlined"
          onClick={run}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? t('advanced.running') : t('advanced.fairness.run')}
        </Button>

        {error && <Alert severity="error">{error}</Alert>}

        {freq && serial && gaps && (
          <>
            <Alert severity={freq.isFair ? 'success' : 'warning'}>
              {t('advanced.fairness.frequencyResult', {
                verdict: freq.isFair ? t('advanced.fairness.fair') : t('advanced.fairness.unfair'),
                pValue: decimal.format(freq.pValue),
              })}
            </Alert>
            <Alert severity={serial.isRandom ? 'success' : 'warning'}>
              {t('advanced.fairness.serialResult', {
                verdict: serial.isRandom ? t('advanced.fairness.random') : t('advanced.fairness.notRandom'),
                r: decimal.format(serial.lag1Correlation),
                pValue: decimal.format(serial.pValue),
              })}
            </Alert>

            <Typography variant="subtitle2">{t('advanced.fairness.gapTitle')}</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('advanced.fairness.number')}</TableCell>
                    <TableCell align="right">{t('advanced.fairness.meanGap')}</TableCell>
                    <TableCell align="right">{t('advanced.fairness.expectedGap')}</TableCell>
                    <TableCell align="right">z-score</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {gaps.map((row) => (
                    <TableRow key={row.number}>
                      <TableCell>{row.number}</TableCell>
                      <TableCell align="right">{decimal.format(row.meanGap)}</TableCell>
                      <TableCell align="right">{decimal.format(row.expectedGap)}</TableCell>
                      <TableCell align="right">{decimal.format(row.zScore)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {stability && (
          <>
            <Typography variant="subtitle2">{t('advanced.fairness.walkForwardTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('advanced.fairness.walkForwardSummary', {
                cuts: stability.totalCuts,
                advantage: stability.significantAdvantage,
                disadvantage: stability.significantDisadvantage,
                consistency: percent.format(stability.consistency),
              })}
            </Typography>
          </>
        )}

        <Typography variant="caption" color="text.secondary">
          {t('advanced.fairness.footnote')}
        </Typography>
      </Stack>
    </SectionAccordion>
  );
}

/** Benchmark de estratégias com correção de múltiplas comparações. */
function BenchmarkSection({ lottery }: { lottery: Lottery }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  async function run(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const history = (await getDraws(lottery)).sort((a, b) => a.date.localeCompare(b.date));
      if (history.length < 40) {
        throw new Error(t('advanced.benchmark.notEnoughData'));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      const validationSize = Math.min(20, Math.floor(history.length * 0.1));
      const training = history.slice(0, history.length - validationSize);
      const validation = history.slice(history.length - validationSize);
      setResult(runStrategyBenchmark(training, validation, lottery, { simulationRounds: 50 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('advanced.runError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionAccordion title={t('advanced.benchmark.title')} subtitle={t('advanced.benchmark.subtitle')}>
      <Stack spacing={2}>
        <Button
          variant="outlined"
          onClick={run}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? t('advanced.running') : t('advanced.benchmark.run')}
        </Button>

        {error && <Alert severity="error">{error}</Alert>}

        {result && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('advanced.benchmark.strategy')}</TableCell>
                  <TableCell align="right">{t('advanced.benchmark.meanHits')}</TableCell>
                  <TableCell align="right">{t('advanced.benchmark.prizeRate')}</TableCell>
                  <TableCell align="right">p-value</TableCell>
                  <TableCell align="right">Bonferroni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.results.map((row, index) => (
                  <TableRow key={row.strategy}>
                    <TableCell>
                      <Typography variant="body2">{row.strategy}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.description}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {decimal.format(row.meanHits)}{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        ({decimal.format(row.expectedMeanHits)})
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{percent.format(row.prizeRate)}</TableCell>
                    <TableCell align="right">{decimal.format(row.pValue)}</TableCell>
                    <TableCell align="right">
                      {result.bonferroni[index].significant ? (
                        <Chip size="small" color="warning" label={t('advanced.benchmark.significant')} />
                      ) : (
                        <Chip size="small" variant="outlined" label={t('advanced.benchmark.notSignificant')} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Typography variant="caption" color="text.secondary">
          {t('advanced.benchmark.footnote')}
        </Typography>
      </Stack>
    </SectionAccordion>
  );
}

/** Wheeling system fixo C(10,6,4) aplicado às dezenas informadas pelo usuário. */
function WheelingSection() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<number[][] | null>(null);

  function handleApply(): void {
    setError(null);
    setGames(null);
    const numbers = input
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);

    if (numbers.some((n) => !Number.isInteger(n))) {
      setError(t('advanced.wheeling.invalidInput'));
      return;
    }
    try {
      setGames(applyWheel(WHEEL_10_6_4, numbers));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('advanced.runError'));
    }
  }

  return (
    <SectionAccordion title={t('advanced.wheeling.title')} subtitle={t('advanced.wheeling.subtitle')}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('advanced.wheeling.explanation')}
        </Typography>
        <TextField
          label={t('advanced.wheeling.inputLabel')}
          placeholder="1, 5, 9, 12, 18, 22, 30, 41, 47, 55"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          fullWidth
        />
        <Button variant="outlined" onClick={handleApply}>
          {t('advanced.wheeling.apply')}
        </Button>

        {error && <Alert severity="error">{error}</Alert>}

        {games && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {t('advanced.wheeling.gamesCount', { count: games.length })}
            </Typography>
            {games.map((game, index) => (
              <Typography key={index} variant="body2" sx={{ fontFamily: 'monospace' }}>
                {game.map((n) => String(n).padStart(2, '0')).join(' · ')}
              </Typography>
            ))}
          </Stack>
        )}
      </Stack>
    </SectionAccordion>
  );
}

/** Valor esperado e Kelly Criterion, com entrada manual de prêmios médios. */
function ExpectedValueSection({ lottery }: { lottery: Lottery }) {
  const { t } = useTranslation();
  const [ticketCost, setTicketCost] = useState('5');
  const [accumulated, setAccumulated] = useState('0');
  const [bankroll, setBankroll] = useState('1000');

  const topTierKey = lottery === Lottery.MEGA_SENA ? '6' : '6+2';
  const midTierKey = lottery === Lottery.MEGA_SENA ? '5' : '5+0';
  const lowTierKey = lottery === Lottery.MEGA_SENA ? '4' : '4+0';

  // Prêmios médios de referência — dado externo ao engine (não vem de nenhum
  // histórico), só uma estimativa razoável para ilustrar o cálculo.
  const prizeAverages: PrizeAverage[] = [
    { tier: topTierKey, averagePrize: 0 }, // a faixa máxima só entra via `accumulatedPrize`
    { tier: midTierKey, averagePrize: lottery === Lottery.MEGA_SENA ? 50000 : 30000 },
    { tier: lowTierKey, averagePrize: lottery === Lottery.MEGA_SENA ? 1000 : 800 },
  ];

  const cost = Number(ticketCost) || 0;
  const acc = Number(accumulated) || 0;
  const bank = Number(bankroll) || 0;

  const ev = calculateEV(lottery, prizeAverages, cost, acc);
  const kelly = kellySimulation(bank, lottery, prizeAverages, cost, acc);

  return (
    <SectionAccordion title={t('advanced.ev.title')} subtitle={t('advanced.ev.subtitle')}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2}>
          <TextField
            label={t('advanced.ev.ticketCost')}
            type="number"
            value={ticketCost}
            onChange={(event) => setTicketCost(event.target.value)}
            fullWidth
          />
          <TextField
            label={t('advanced.ev.accumulated')}
            type="number"
            value={accumulated}
            onChange={(event) => setAccumulated(event.target.value)}
            fullWidth
          />
        </Stack>
        <TextField
          label={t('advanced.ev.bankroll')}
          type="number"
          value={bankroll}
          onChange={(event) => setBankroll(event.target.value)}
        />

        <Alert severity={ev.ev > 0 ? 'success' : 'info'}>
          {t('advanced.ev.result', {
            ev: currency.format(ev.ev),
            percent: decimal.format(ev.evPercent),
          })}
        </Alert>

        {Number.isFinite(ev.breakEvenAccumulated) && (
          <Typography variant="body2" color="text.secondary">
            {t('advanced.ev.breakEven', { value: currency.format(ev.breakEvenAccumulated) })}
          </Typography>
        )}

        <Typography variant="body2" color="text.secondary">
          {t('advanced.ev.kelly', {
            fraction: percent.format(kelly.fraction),
            bet: currency.format(kelly.recommendedBet),
          })}
        </Typography>

        <Typography variant="caption" color="text.secondary">
          {t('advanced.ev.footnote')}
        </Typography>
      </Stack>
    </SectionAccordion>
  );
}
