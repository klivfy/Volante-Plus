'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GameCard from '@/components/GameCard';
import GameSlider from '@/components/GameSlider';
import LotterySelector from '@/components/LotterySelector';
import NextDrawCard from '@/components/NextDrawCard';
import { analyzeBacktest, analyzeTrevoBacktest } from '@/engine/backtestAnalyzer';
import { generateGames } from '@/engine/gameGenerator';
import { hasTrevos } from '@/engine/prizeRules';
import { useNextDraw } from '@/hooks/useNextDraw';
import { getDraws, getPerformances } from '@/services/db';
import { GameBatch, GeneratedGame, Lottery, MIN_GAMES, NumberPerformance } from '@/types/domain';

type PageStatus = 'loading' | 'analyzing' | 'ready' | 'error';

/** Cede um tick ao event loop antes de um cálculo síncrono pesado, para a UI pintar o estado "Analisando" primeiro. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function gameToText(lottery: Lottery, game: GeneratedGame): string {
  const numbers = game.numbers.map((n) => String(n).padStart(2, '0')).join(' ');
  if (!hasTrevos(lottery) || !game.trevoDuplas?.length) {
    return numbers;
  }
  const trevos = game.trevoDuplas.map((dupla) => dupla.join('-')).join(' | ');
  return `${numbers}\nTrevos: ${trevos}`;
}

export default function VolantePage() {
  const { t } = useTranslation();
  const [lottery, setLottery] = useState<Lottery>(Lottery.MEGA_SENA);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [performances, setPerformances] = useState<NumberPerformance[]>([]);
  const [trevoPerformances, setTrevoPerformances] = useState<NumberPerformance[]>([]);
  const [batchCount, setBatchCount] = useState<number>(MIN_GAMES);
  const [generatedBatch, setGeneratedBatch] = useState<GameBatch | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const nextDraw = useNextDraw(lottery);

  useEffect(() => {
    let cancelled = false;

    async function loadPerformances(): Promise<void> {
      setStatus('loading');
      setGeneratedBatch(null);
      try {
        const cached = await getPerformances(lottery);
        if (cancelled) return;

        if (cached) {
          setPerformances(cached.performances);
          setTrevoPerformances(cached.trevoPerformances);
          setStatus('ready');
          return;
        }

        setStatus('analyzing');
        await yieldToUi();

        const draws = await getDraws(lottery);
        if (cancelled) return;

        const numberPerformances = analyzeBacktest(draws, lottery);
        const trevos = hasTrevos(lottery) ? analyzeTrevoBacktest(draws, lottery) : [];
        if (cancelled) return;

        setPerformances(numberPerformances);
        setTrevoPerformances(trevos);
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setErrorMessage(t('volante.performanceError'));
          setStatus('error');
        }
      }
    }

    loadPerformances();
    return () => {
      cancelled = true;
    };
  }, [lottery, t]);

  function handleGenerate(): void {
    try {
      const batch = generateGames(lottery, batchCount, performances, {
        trevoPerformances,
      });
      setGeneratedBatch(batch);
    } catch (error) {
      setToast(error instanceof Error ? error.message : t('volante.generateError'));
    }
  }

  async function handleCopy(game: GeneratedGame): Promise<void> {
    try {
      await navigator.clipboard.writeText(gameToText(lottery, game));
      setToast(t('volante.copiedToClipboard'));
    } catch {
      setToast(t('volante.copyError'));
    }
  }

  async function handleShare(game: GeneratedGame): Promise<void> {
    const text = gameToText(lottery, game);
    if (!navigator.share) {
      await handleCopy(game);
      return;
    }
    try {
      await navigator.share({ title: t('volante.shareTitle'), text });
    } catch {
      // Usuário cancelou o compartilhamento — não é um erro a relatar.
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('volante.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('volante.subtitle')}
          </Typography>
        </Box>

        <LotterySelector value={lottery} onChange={setLottery} />

        <NextDrawCard nextDraw={nextDraw.data} loading={nextDraw.loading} />

        {status === 'error' && <Alert severity="error">{errorMessage}</Alert>}

        <Card variant="outlined">
          <CardContent>
            <GameSlider value={batchCount} onChange={setBatchCount} />
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleGenerate}
              disabled={status !== 'ready'}
              sx={{ mt: 2 }}
              startIcon={status === 'analyzing' ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {status === 'analyzing' ? t('volante.analyzing') : t('volante.generate')}
            </Button>
          </CardContent>
        </Card>

        {generatedBatch && (
          <Grid container spacing={2}>
            {generatedBatch.games.map((game, index) => (
              <Grid key={index} size={{ xs: 12, sm: 6 }}>
                <GameCard
                  lottery={lottery}
                  game={game}
                  index={index + 1}
                  onCopy={handleCopy}
                  onShare={handleShare}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>

      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
      />
    </Container>
  );
}
