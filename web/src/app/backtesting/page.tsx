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
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { runBacktest } from '@/engine/backtestEngine';
import { getDrawsAfter, getDrawsUpTo, savePerformances } from '@/services/db';
import { BacktestReport, Lottery, MAX_GAMES, MIN_GAMES } from '@/types/domain';

type Status = 'idle' | 'running' | 'ready' | 'error';

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const decimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

export default function BacktestingPage() {
  const { t } = useTranslation();
  const lotteryLabel: Record<Lottery, string> = {
    [Lottery.MEGA_SENA]: t('lottery.megaSena'),
    [Lottery.MAIS_MILIONARIA]: t('lottery.maisMilionaria'),
  };
  const router = useRouter();
  const [lottery, setLottery] = useState<Lottery>(Lottery.MEGA_SENA);
  const [cutoffDate, setCutoffDate] = useState('');
  const [gamesPerContest, setGamesPerContest] = useState(MIN_GAMES);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<BacktestReport | null>(null);

  const cutoffValid = /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate);

  async function handleRun(): Promise<void> {
    if (!cutoffValid) {
      setErrorMessage(t('backtesting.invalidCutoff'));
      setStatus('error');
      return;
    }

    setStatus('running');
    setErrorMessage(null);
    await yieldToUi();

    try {
      const [training, validation] = await Promise.all([
        getDrawsUpTo(lottery, cutoffDate),
        getDrawsAfter(lottery, cutoffDate),
      ]);

      if (validation.length === 0) {
        setErrorMessage(t('backtesting.noValidationDraws', { date: cutoffDate }));
        setStatus('error');
        return;
      }

      const result = runBacktest(lottery, training, validation, { gamesPerContest });
      setReport(result);
      setStatus('ready');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('backtesting.runError'));
      setStatus('error');
    }
  }

  async function handleUseForGeneration(): Promise<void> {
    if (!report) return;
    await savePerformances(lottery, report.performances, report.trevoPerformances, {
      source: 'manual',
      force: true,
    });
    router.push('/');
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('backtesting.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('backtesting.subtitle')}
          </Typography>
        </Box>

        <Tabs value={lottery} onChange={(_, value) => setLottery(value)} variant="fullWidth">
          <Tab value={Lottery.MEGA_SENA} label={lotteryLabel[Lottery.MEGA_SENA]} />
          <Tab value={Lottery.MAIS_MILIONARIA} label={lotteryLabel[Lottery.MAIS_MILIONARIA]} />
        </Tabs>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <TextField
                label={t('backtesting.cutoffDate')}
                type="date"
                value={cutoffDate}
                onChange={(event) => setCutoffDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={t('backtesting.cutoffHelper')}
                fullWidth
              />

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t('backtesting.gamesPerContest')}
                </Typography>
                <Slider
                  value={gamesPerContest}
                  onChange={(_, value) => setGamesPerContest(value as number)}
                  min={MIN_GAMES}
                  max={MAX_GAMES}
                  step={1}
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
                disabled={status === 'running'}
                startIcon={status === 'running' ? <CircularProgress size={18} color="inherit" /> : undefined}
              >
                {status === 'running' ? t('backtesting.running') : t('backtesting.run')}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {status === 'error' && errorMessage && <Alert severity="error">{errorMessage}</Alert>}

        {report && (
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
