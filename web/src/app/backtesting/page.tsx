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
import { runBacktest } from '@/engine/backtestEngine';
import { getDrawsAfter, getDrawsUpTo, savePerformances } from '@/services/db';
import { BacktestReport, Lottery, MAX_GAMES, MIN_GAMES } from '@/types/domain';

const LOTTERY_LABEL: Record<Lottery, string> = {
  [Lottery.MEGA_SENA]: 'Mega-Sena',
  [Lottery.MAIS_MILIONARIA]: '+Milionária',
};

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
      setErrorMessage('Informe uma data de corte válida (aaaa-mm-dd).');
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
        setErrorMessage(`Sem concursos após ${cutoffDate} no histórico local — nada a validar.`);
        setStatus('error');
        return;
      }

      const result = runBacktest(lottery, training, validation, { gamesPerContest });
      setReport(result);
      setStatus('ready');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao executar o backtest.');
      setStatus('error');
    }
  }

  async function handleUseForGeneration(): Promise<void> {
    if (!report) return;
    await savePerformances(lottery, report.performances, report.trevoPerformances);
    router.push('/');
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Backtesting
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Mede o desempenho das dezenas só na janela de treino e valida contra os concursos
            posteriores à data de corte.
          </Typography>
        </Box>

        <Tabs value={lottery} onChange={(_, value) => setLottery(value)} variant="fullWidth">
          <Tab value={Lottery.MEGA_SENA} label={LOTTERY_LABEL[Lottery.MEGA_SENA]} />
          <Tab value={Lottery.MAIS_MILIONARIA} label={LOTTERY_LABEL[Lottery.MAIS_MILIONARIA]} />
        </Tabs>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <TextField
                label="Data de corte"
                type="date"
                value={cutoffDate}
                onChange={(event) => setCutoffDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Concursos até esta data ficam na janela de treino; o restante valida."
                fullWidth
              />

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Jogos por concurso
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
                {status === 'running' ? 'Executando…' : 'Executar backtest'}
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
                    <TableCell>Concursos</TableCell>
                    <TableCell align="right">
                      treino {report.trainingDraws} · validação {report.validationDraws}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Jogos / apostas</TableCell>
                    <TableCell align="right">
                      {report.totalGames} / {report.totalBets}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Média de acertos</TableCell>
                    <TableCell align="right">
                      {decimalFormatter.format(report.stats.mean)}
                      <Trend observed={report.stats.mean} expected={report.expectedMeanHits} />
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                        (esperado: {decimalFormatter.format(report.expectedMeanHits)})
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Variância</TableCell>
                    <TableCell align="right">{decimalFormatter.format(report.stats.variance)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Desvio padrão</TableCell>
                    <TableCell align="right">{decimalFormatter.format(report.stats.stdDeviation)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Taxa de eficácia</TableCell>
                    <TableCell align="right">
                      {percentFormatter.format(report.prizeRate)} ({report.prizeCount} apostas
                      premiadas)
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="caption" color="text.secondary">
              A seta marca só a direção da diferença — dado o tamanho da amostra, ela costuma
              caber dentro do ruído estatístico esperado pela hipótese nula.
            </Typography>

            <Button variant="outlined" size="large" onClick={handleUseForGeneration}>
              Usar estes dados para gerar jogos
            </Button>
          </>
        )}
      </Stack>
    </Container>
  );
}
