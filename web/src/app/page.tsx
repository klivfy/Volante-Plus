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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import GameCard from '@/components/GameCard';
import GameSlider from '@/components/GameSlider';
import LotterySelector from '@/components/LotterySelector';
import NextDrawCard from '@/components/NextDrawCard';
import NotificationOptIn from '@/components/NotificationOptIn';
import { trackGameGeneration, trackLotterySelection, trackBacktestDataUsage } from '@/services/analytics';
import { reportUserError, reportError, addBreadcrumb } from '@/services/errorReporter';
import { generateGames } from '@/engine/gameGenerator';
import { hasTrevos } from '@/engine/prizeRules';
import { useNextDraw } from '@/hooks/useNextDraw';
import { usePerformanceCache } from '@/hooks/usePerformanceCache';
import { GameBatch, GeneratedGame, Lottery, MIN_GAMES } from '@/types/domain';

/**
 * `idle`: performances prontas, nenhum lote gerado ainda.
 * `analyzing`: aguardando o cache/worker de performances (`usePerformanceCache`).
 * `ready`: último lote gerado está em tela.
 * `generating`: `generateGames` rodando (envolvido num tick assíncrono só para o spinner aparecer).
 * `error`: falha ao carregar performances ou ao gerar jogos.
 */
type PageStatus = 'idle' | 'analyzing' | 'ready' | 'generating' | 'error';

/** Cede um tick ao event loop antes de um cálculo síncrono, para a UI pintar o estado "Gerando" primeiro. */
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
  const [generating, setGenerating] = useState(false);
  const [batchCount, setBatchCount] = useState<number>(MIN_GAMES);
  const [generatedBatch, setGeneratedBatch] = useState<GameBatch | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const nextDraw = useNextDraw(lottery);
  const { performances, trevoPerformances, loading, error } = usePerformanceCache(lottery);

  // Loteria trocada: o lote gerado era para a análise anterior, não faz
  // sentido continuar em tela. Ajuste durante a renderização (não em efeito)
  // para refletir isso no mesmo commit, como em `useNextDraw`.
  const [trackedLottery, setTrackedLottery] = useState(lottery);
  if (lottery !== trackedLottery) {
    setTrackedLottery(lottery);
    setGeneratedBatch(null);
    trackLotterySelection(lottery);
  }

  const status: PageStatus = error
    ? 'error'
    : generating
      ? 'generating'
      : loading
        ? 'analyzing'
        : generatedBatch
          ? 'ready'
          : 'idle';

  const canGenerate = status === 'idle' || status === 'ready';
  const isBusy = status === 'analyzing' || status === 'generating';

  async function handleGenerate(): Promise<void> {
    setGenerating(true);
    await yieldToUi();
    try {
      addBreadcrumb('Starting game generation', {
        lottery: lottery.toString(),
        batchCount,
      });

      trackBacktestDataUsage({
        lottery: lottery.toString(),
        dataSource: performances.length > 0 ? 'cached' : 'worker-computed',
      });
      const batch = generateGames(lottery, batchCount, performances, {
        trevoPerformances,
      });
      trackGameGeneration({
        lottery: lottery.toString(),
        batchSize: batchCount,
      });
      setGeneratedBatch(batch);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('volante.generateError');
      reportUserError(err instanceof Error ? err : new Error(errorMsg), {
        tags: {
          feature: 'game-generation',
          lottery: lottery.toString(),
        },
      });
      setToast(errorMsg);
    } finally {
      setGenerating(false);
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
    <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
              {t('volante.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('volante.subtitle')}
            </Typography>
          </Box>
          <NotificationOptIn />
        </Box>

        <LotterySelector value={lottery} onChange={setLottery} disabled={isBusy} />

        <NextDrawCard nextDraw={nextDraw.data} loading={nextDraw.loading} />

        {status === 'error' && <Alert severity="error">{t('volante.performanceError')}</Alert>}

        <Card variant="outlined">
          <CardContent>
            <GameSlider value={batchCount} onChange={setBatchCount} disabled={isBusy} />
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleGenerate}
              disabled={!canGenerate}
              aria-busy={isBusy}
              sx={{ mt: 2 }}
              startIcon={isBusy ? <CircularProgress size={18} color="inherit" aria-hidden /> : undefined}
            >
              {status === 'analyzing'
                ? t('volante.analyzing')
                : status === 'generating'
                  ? t('volante.generating')
                  : t('volante.generate')}
            </Button>
          </CardContent>
        </Card>

        {generatedBatch && (
          <Grid container spacing={2} role="list" aria-label={t('volante.generatedGamesList')}>
            {generatedBatch.games.map((game, index) => (
              <Grid key={index} role="listitem" size={{ xs: 12, sm: 6, md: 4 }}>
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
