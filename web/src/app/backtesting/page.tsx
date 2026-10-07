'use client';

import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LabeledTextField from '@/components/LabeledTextField';
import LotterySelector from '@/components/LotterySelector';
import { useBacktestWorker } from '@/hooks/useBacktestWorker';
import { useLotteryTheme } from '@/context/LotteryThemeContext';
import { trackLotterySelection } from '@/services/analytics';
import { getDrawsAfter, getDrawsUpTo, savePerformances } from '@/services/db';
import { Lottery, MAX_GAMES, MIN_GAMES } from '@/types/domain';

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const decimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

interface TrendProps {
  observed: number;
  expected: number;
}

/**
 * A diferença entre observado e esperado costuma caber dentro do ruído
 * amostral — o ícone marca a direção, não uma "vantagem" real do método.
 */
function Trend({ observed, expected }: TrendProps) {
  if (Math.abs(observed - expected) < 1e-9) {
    return null;
  }
  return observed > expected ? (
    <TrendingUpIcon fontSize="small" color="success" sx={{ verticalAlign: 'middle', ml: 0.5 }} />
  ) : (
    <TrendingDownIcon fontSize="small" color="error" sx={{ verticalAlign: 'middle', ml: 0.5 }} />
  );
}

function formatHitDistribution(distribution: Record<number, number>): string {
  return Object.entries(distribution)
    .map(([hits, count]) => [Number(hits), count] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([hits, count]) => `${hits}×${count}`)
    .join(' · ');
}

export default function BacktestingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { setLottery: setThemeLottery } = useLotteryTheme();
  const [lottery, setLottery] = useState<Lottery>(Lottery.MEGA_SENA);
  const [cutoffDate, setCutoffDate] = useState('');
  const [gamesPerContest, setGamesPerContest] = useState(MIN_GAMES);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { report, loading: workerLoading, error: workerError, run } = useBacktestWorker();

  // Sincroniza a modalidade com o tema global
  const handleLotteryChange = (newLottery: Lottery) => {
    setLottery(newLottery);
    setThemeLottery(newLottery);
    trackLotterySelection(newLottery);
  };

  // O relatório vive no worker e não pode ser "resetado" daqui; ao trocar de
  // loteria marcamos o relatório atual como obsoleto (ajuste durante a
  // renderização, não em efeito — mesma abordagem de `useNextDraw`), até que um
  // novo backtest seja disparado para a loteria selecionada.
  const [trackedLottery, setTrackedLottery] = useState(lottery);
  const [reportStale, setReportStale] = useState(true);
  if (lottery !== trackedLottery) {
    setTrackedLottery(lottery);
    setReportStale(true);
    setLocalError(null);
  }

  const cutoffValid = /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate);
  const running = submitting || workerLoading;
  const errorMessage = localError ?? workerError;
  const showReport = report !== null && !reportStale;

  async function handleRun(): Promise<void> {
    setLocalError(null);
    if (!cutoffValid) {
      setLocalError(t('backtesting.invalidCutoff'));
      return;
    }

    setSubmitting(true);
    try {
      const [training, validation] = await Promise.all([
        getDrawsUpTo(lottery, cutoffDate),
        getDrawsAfter(lottery, cutoffDate),
      ]);

      if (validation.length === 0) {
        setLocalError(t('backtesting.noValidationDraws', { date: cutoffDate }));
        return;
      }

      setReportStale(false);
      // Cálculo pesado (Monte Carlo + geração contra cada concurso de
      // validação) fora da thread principal — a UI segue responsiva.
      run({
        kind: 'backtest',
        lottery,
        trainingDraws: training,
        validationDraws: validation,
        gamesPerContest,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('backtesting.runError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUseForGeneration(): Promise<void> {
    if (!report || reportStale) return;
    // Cache `manual`: tem prioridade sobre a análise automática e expira
    // sozinho após `MANUAL_CACHE_TTL_MS` (ver `savePerformances`).
    await savePerformances(lottery, report.performances, report.trevoPerformances, {
      source: 'manual',
      force: true,
    });
    router.push('/');
  }

  return (
    <Container component="main" maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {t('backtesting.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('backtesting.subtitle')}
          </Typography>
        </Box>

        <LotterySelector value={lottery} onChange={handleLotteryChange} disabled={running} />

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <LabeledTextField
                label={t('backtesting.cutoffDate')}
                type="date"
                value={cutoffDate}
                onChange={(event) => setCutoffDate(event.target.value)}
                helperText={t('backtesting.cutoffHelper')}
                disabled={running}
              />

              <Box>
                <Typography variant="subtitle2" gutterBottom id="games-per-contest-label">
                  {t('backtesting.gamesPerContest')}
                </Typography>
                <Slider
                  value={gamesPerContest}
                  onChange={(_, value) => setGamesPerContest(value as number)}
                  min={MIN_GAMES}
                  max={MAX_GAMES}
                  step={1}
                  disabled={running}
                  aria-labelledby="games-per-contest-label"
                  marks={Array.from({ length: MAX_GAMES - MIN_GAMES + 1 }, (_, i) => ({
                    value: MIN_GAMES + i,
                    label: `${MIN_GAMES + i}`,
                  }))}
                  valueLabelDisplay="auto"
                />
              </Box>

              <Button
                variant="contained"
                size="large"
                onClick={handleRun}
                disabled={running}
                aria-busy={running}
                startIcon={running ? <CircularProgress size={18} color="inherit" aria-hidden /> : undefined}
              >
                {running ? t('backtesting.running') : t('backtesting.run')}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

        {showReport && report && (
          <>
            <TableContainer component={Card} variant="outlined">
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>{t('backtesting.contests')}</TableCell>
                    <TableCell align="right">
                      {t('backtesting.contestsValue', {
                        training: report.trainingDraws,
                        validation: report.validationDraws,
                      })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t('backtesting.gamesBets')}</TableCell>
                    <TableCell align="right">
                      {t('backtesting.gamesBetsValue', {
                        games: report.totalGames,
                        bets: report.totalBets,
                      })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t('backtesting.meanHits')}</TableCell>
                    <TableCell align="right">
                      {decimalFormatter.format(report.stats.mean)}
                      <Trend observed={report.stats.mean} expected={report.expectedMeanHits} />
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                        {t('backtesting.expected', {
                          value: decimalFormatter.format(report.expectedMeanHits),
                        })}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t('backtesting.hitDistribution')}</TableCell>
                    <TableCell align="right">{formatHitDistribution(report.hitDistribution)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t('backtesting.variance')}</TableCell>
                    <TableCell align="right">{decimalFormatter.format(report.stats.variance)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t('backtesting.stdDeviation')}</TableCell>
                    <TableCell align="right">{decimalFormatter.format(report.stats.stdDeviation)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>{t('backtesting.prizeRate')}</TableCell>
                    <TableCell align="right">
                      {t('backtesting.prizeRateValue', {
                        rate: percentFormatter.format(report.prizeRate),
                        count: report.prizeCount,
                      })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="caption" color="text.secondary">
              {t('backtesting.footnote')}
            </Typography>

            <Button variant="outlined" size="large" onClick={handleUseForGeneration}>
              {t('backtesting.useForGeneration')}
            </Button>
          </>
        )}
      </Stack>
    </Container>
  );
}
