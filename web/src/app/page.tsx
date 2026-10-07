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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EvidencePanel from '@/components/EvidencePanel';
import GameCard from '@/components/GameCard';
import GameCountControl from '@/components/GameCountControl';
import HistoryStatus from '@/components/HistoryStatus';
import LabeledTextField from '@/components/LabeledTextField';
import { formatDecimal, formatInteger } from '@/lib/format';
import LotterySelector from '@/components/LotterySelector';
import NextDrawCard from '@/components/NextDrawCard';
import NumberPicker from '@/components/NumberPicker';
import SegmentedControl from '@/components/SegmentedControl';
import NotificationOptIn from '@/components/NotificationOptIn';
import PayoutSharePanel from '@/components/PayoutSharePanel';
import { trackGameGeneration, trackLotterySelection, trackBacktestDataUsage } from '@/services/analytics';
import { reportUserError, addBreadcrumb } from '@/services/errorReporter';
import { closureCost, generateClosure, offeredGuarantees, SIMPLE_BET_PRICE_BRL } from '@/engine/closureDesigner';
import { generateGames, maxDistinctGames } from '@/engine/gameGenerator';
import { bayesEvidenceFromPerformances } from '@/engine/bayesEvidence';
import { guaranteeProbability } from '@/engine/betPlanning';
import { numberEvidence } from '@/engine/numberEvidence';
import { evaluatePayoutBatch } from '@/engine/payoutShare';
import { hasTrevos, lotteryRules } from '@/engine/prizeRules';
import { useNextDraw } from '@/hooks/useNextDraw';
import { usePerformanceCache } from '@/hooks/usePerformanceCache';
import { useLotteryTheme } from '@/context/LotteryThemeContext';
import { GameBatch, GameMode, GeneratedGame, Lottery, MIN_GAMES } from '@/types/domain';

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
  // A modalidade é global (contexto): a mesma em todas as abas e no tema.
  const { lottery, setLottery } = useLotteryTheme();
  const [generating, setGenerating] = useState(false);
  const [batchCount, setBatchCount] = useState<number>(MIN_GAMES);
  const [generatedBatch, setGeneratedBatch] = useState<GameBatch | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Apostas no concurso, informadas manualmente: sem elas o efeito do
  // rateio não é calculável — a API pública não expõe a arrecadação do
  // concurso, só o prêmio estimado — e exibir um ganho sem esse número
  // seria inventá-lo. Ver `payoutShare.ts`.
  const [ticketsInput, setTicketsInput] = useState('');
  const [mode, setMode] = useState<GameMode>(GameMode.JOGOS_AVULSOS);
  const [pool, setPool] = useState<number[]>([]);
  const [guarantee, setGuarantee] = useState<number>(4);

  const nextDraw = useNextDraw(lottery);
  const { performances, trevoPerformances, loading, error } = usePerformanceCache(lottery);
  const evidence = useMemo(
    () => (performances.length > 0 ? numberEvidence(lottery, performances) : null),
    [lottery, performances],
  );
  const bayes = useMemo(
    () => (performances.length > 0 ? bayesEvidenceFromPerformances(lottery, performances) : null),
    [lottery, performances],
  );
  // Na +Milionária os trevos recebem exatamente o mesmo tratamento das dezenas.
  const trevoEvidence = useMemo(
    () =>
      hasTrevos(lottery) && trevoPerformances.length > 0
        ? numberEvidence(lottery, trevoPerformances, 'trevos')
        : null,
    [lottery, trevoPerformances],
  );
  const trevoBayes = useMemo(
    () =>
      hasTrevos(lottery) && trevoPerformances.length > 0
        ? bayesEvidenceFromPerformances(lottery, trevoPerformances, 'trevos')
        : null,
    [lottery, trevoPerformances],
  );
  const rules = lotteryRules(lottery);
  const guarantees = offeredGuarantees(lottery);
  const closureMode = mode === GameMode.FECHAMENTO;
  const minPool = rules.numbersPerBet + 1;

  const handleLotteryChange = (newLottery: Lottery) => {
    setLottery(newLottery);
    trackLotterySelection(newLottery);
  };

  // Loteria trocada: o lote gerado era para a análise anterior, não faz
  // sentido continuar em tela. Ajuste durante a renderização (não em efeito)
  // para refletir isso no mesmo commit, como em `useNextDraw`.
  const [trackedLottery, setTrackedLottery] = useState(lottery);
  if (lottery !== trackedLottery) {
    setTrackedLottery(lottery);
    setGeneratedBatch(null);
    setPool([]);
    setGuarantee(offeredGuarantees(lottery)[offeredGuarantees(lottery).length - 1] ?? 4);
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

  const canGenerate =
    (status === 'idle' || status === 'ready') && (!closureMode || pool.length >= minPool);
  const isBusy = status === 'analyzing' || status === 'generating';

  // A deduplicação absoluta gasta dezenas: um lote de 4 jogos de Mega-Sena
  // precisa de 24 dezenas analisadas distintas. Quando o desempenho disponível
  // não cobre o pedido, `generateGames` devolve menos jogos — avisamos antes de
  // clicar, em vez de deixar o usuário descobrir pelo lote menor.
  const gamesAvailable =
    performances.length > 0 ? maxDistinctGames(lottery, performances.length) : batchCount;
  const batchLimited = !loading && batchCount > gamesAvailable;

  const tickets = Number(ticketsInput) >= 1 ? Number(ticketsInput) : undefined;
  const payoutAssessment =
    generatedBatch && tickets !== undefined ? evaluatePayoutBatch(generatedBatch, tickets) : null;

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
      const batch = closureMode
        ? generateClosure(lottery, pool, guarantee)
        : generateGames(lottery, batchCount, performances, { trevoPerformances });
      trackGameGeneration({
        lottery: lottery.toString(),
        batchSize: batch.games.length,
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

        <LotterySelector value={lottery} onChange={handleLotteryChange} disabled={isBusy} />

        <HistoryStatus lottery={lottery} />

        <NextDrawCard nextDraw={nextDraw.data} loading={nextDraw.loading} />

        {status === 'error' && <Alert severity="error">{t('volante.performanceError')}</Alert>}

        <Card variant="outlined">
          <CardContent>
            <SegmentedControl
              value={mode}
              onChange={(next: GameMode) => {
                setMode(next);
                setGeneratedBatch(null);
              }}
              disabled={isBusy}
              ariaLabel={t('volante.modeLabel')}
              options={[
                { value: GameMode.JOGOS_AVULSOS, label: t('volante.modeAvulsos') },
                { value: GameMode.FECHAMENTO, label: t('volante.modeFechamento') },
              ]}
            />
            <Box sx={{ mb: 2 }} />
            {closureMode ? (
              <>
                <NumberPicker
                  universe={rules.numberUniverse}
                  selected={pool}
                  max={rules.maxSelection}
                  onChange={setPool}
                  disabled={isBusy}
                />
                {guarantees.length > 1 && (
                  <Box sx={{ mt: 2 }}>
                    <SegmentedControl
                      value={guarantee}
                      onChange={setGuarantee}
                      disabled={isBusy}
                      ariaLabel={t('fechamento.guaranteeLabel')}
                      options={guarantees.map((g) => ({
                        value: g,
                        label: t('fechamento.guaranteeOption', { t: g }),
                      }))}
                    />
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  {pool.length < minPool
                    ? t('fechamento.needMore', { min: minPool })
                    : t('fechamento.costNote', { price: SIMPLE_BET_PRICE_BRL })}
                </Typography>
              </>
            ) : (
              <>
                <GameCountControl value={batchCount} onChange={setBatchCount} disabled={isBusy} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {t('volante.strategyNote')}
                </Typography>
              </>
            )}
            {!closureMode && batchLimited && (
              <Alert severity="info" sx={{ mt: 2 }}>
                {t('volante.batchLimited', {
                  available: performances.length,
                  max: gamesAvailable,
                })}
              </Alert>
            )}
            <LabeledTextField
              label={t('payoutShare.ticketsInput')}
              helperText={t('payoutShare.ticketsInputHelp')}
              type="number"
              size="small"
              value={ticketsInput}
              onChange={(event) => setTicketsInput(event.target.value)}
              disabled={isBusy}
              sx={{ mt: 2 }}
            />
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
                  : closureMode
                    ? t('fechamento.generate')
                    : t('volante.generate')}
            </Button>
          </CardContent>
        </Card>

        {generatedBatch?.closure && (
          <Alert severity="success">
            <strong>{t('fechamento.closureResult', { t: generatedBatch.closure.guarantee })}</strong>
            <br />
            {t('fechamento.contract', {
              games: generatedBatch.games.length,
              cost: formatDecimal(closureCost(generatedBatch.games.length), 2),
              t: generatedBatch.closure.guarantee,
              pool: generatedBatch.closure.poolSize,
            })}
            <br />
            {(() => {
              const p = guaranteeProbability(
                lottery,
                generatedBatch.closure.poolSize,
                generatedBatch.closure.guarantee,
              );
              return t('fechamento.odds', {
                percent: formatDecimal(p * 100, 2),
                oneIn: formatInteger(1 / p),
                t: generatedBatch.closure.guarantee,
                pool: generatedBatch.closure.poolSize,
              });
            })()}
          </Alert>
        )}

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
                  payout={payoutAssessment?.games[index]}
                />
              </Grid>
            ))}
          </Grid>
        )}

        {payoutAssessment && <PayoutSharePanel assessment={payoutAssessment} />}

        {evidence && (
          <EvidencePanel
            summary={evidence}
            bayes={bayes}
            expectedShare={rules.numbersDrawn / rules.numberUniverse}
          />
        )}

        {trevoEvidence && (
          <EvidencePanel
            summary={trevoEvidence}
            bayes={trevoBayes}
            expectedShare={rules.trevosDrawn / rules.trevoUniverse}
            space="trevos"
          />
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
