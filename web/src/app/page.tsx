'use client';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import NextDrawCard from '@/components/NextDrawCard';
import { analyzeBacktest, analyzeTrevoBacktest } from '@/engine/backtestAnalyzer';
import { generateGames } from '@/engine/gameGenerator';
import { hasTrevos } from '@/engine/prizeRules';
import { useNextDraw } from '@/hooks/useNextDraw';
import { getDraws, getPerformances } from '@/services/db';
import { GameBatch, GeneratedGame, Lottery, MAX_GAMES, MIN_GAMES, NumberPerformance } from '@/types/domain';

const LOTTERY_LABEL: Record<Lottery, string> = {
  [Lottery.MEGA_SENA]: 'Mega-Sena',
  [Lottery.MAIS_MILIONARIA]: '+Milionária',
};

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
          setErrorMessage('Não foi possível calcular o desempenho das dezenas.');
          setStatus('error');
        }
      }
    }

    loadPerformances();
    return () => {
      cancelled = true;
    };
  }, [lottery]);

  const showsTrevos = useMemo(() => hasTrevos(lottery), [lottery]);

  function handleGenerate(): void {
    try {
      const batch = generateGames(lottery, batchCount, performances, {
        trevoPerformances,
      });
      setGeneratedBatch(batch);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Não foi possível gerar os jogos.');
    }
  }

  async function handleCopy(game: GeneratedGame): Promise<void> {
    try {
      await navigator.clipboard.writeText(gameToText(lottery, game));
      setToast('Jogo copiado para a área de transferência.');
    } catch {
      setToast('Não foi possível copiar o jogo.');
    }
  }

  async function handleShare(game: GeneratedGame): Promise<void> {
    const text = gameToText(lottery, game);
    if (!navigator.share) {
      await handleCopy(game);
      return;
    }
    try {
      await navigator.share({ title: 'Volante+ — Jogo gerado', text });
    } catch {
      // Usuário cancelou o compartilhamento — não é um erro a relatar.
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Volante+
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gerador estatístico. Sem palpite, sem número quente.
          </Typography>
        </Box>

        <Tabs value={lottery} onChange={(_, value) => setLottery(value)} variant="fullWidth">
          <Tab value={Lottery.MEGA_SENA} label={LOTTERY_LABEL[Lottery.MEGA_SENA]} />
          <Tab value={Lottery.MAIS_MILIONARIA} label={LOTTERY_LABEL[Lottery.MAIS_MILIONARIA]} />
        </Tabs>

        <NextDrawCard nextDraw={nextDraw.data} loading={nextDraw.loading} />

        {status === 'error' && <Alert severity="error">{errorMessage}</Alert>}

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Quantos jogos
            </Typography>
            <Slider
              value={batchCount}
              onChange={(_, value) => setBatchCount(value as number)}
              min={MIN_GAMES}
              max={MAX_GAMES}
              step={1}
              marks={Array.from({ length: MAX_GAMES - MIN_GAMES + 1 }, (_, i) => ({
                value: MIN_GAMES + i,
                label: `${MIN_GAMES + i}`,
              }))}
              valueLabelDisplay="auto"
            />
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleGenerate}
              disabled={status !== 'ready'}
              sx={{ mt: 2 }}
              startIcon={status === 'analyzing' ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {status === 'analyzing' ? 'Analisando histórico…' : 'Gerar jogos'}
            </Button>
          </CardContent>
        </Card>

        {generatedBatch && (
          <Grid container spacing={2}>
            {generatedBatch.games.map((game, index) => (
              <Grid key={index} size={{ xs: 12, sm: 6 }}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">
                      Jogo {String(index + 1).padStart(2, '0')}
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
                      {game.numbers.map((number) => (
                        <Box
                          key={number}
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                          }}
                        >
                          {String(number).padStart(2, '0')}
                        </Box>
                      ))}
                    </Stack>
                    {showsTrevos && game.trevoDuplas && game.trevoDuplas.length > 0 && (
                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
                        {game.trevoDuplas.map((dupla) => (
                          <Chip
                            key={dupla.join('-')}
                            size="small"
                            color="secondary"
                            label={`Trevos ${dupla.join('-')}`}
                          />
                        ))}
                      </Stack>
                    )}
                  </CardContent>
                  <CardActions>
                    <IconButton aria-label="Copiar jogo" onClick={() => handleCopy(game)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                    <IconButton aria-label="Compartilhar jogo" onClick={() => handleShare(game)}>
                      <ShareIcon fontSize="small" />
                    </IconButton>
                  </CardActions>
                </Card>
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
