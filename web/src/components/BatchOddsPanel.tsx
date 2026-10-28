'use client';

import CalculateIcon from '@mui/icons-material/Calculate';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { BatchOdds, concursosForNoPrize } from '../engine/batchOdds';
import { prizeTiers } from '../engine/prizeRules';
import { Lottery } from '../types/domain';

export interface BatchOddsPanelProps {
  lottery: Lottery;
  odds: BatchOdds;
  /**
   * 'model': prévia em tempo real do lote-modelo (jogos disjuntos), antes de
   * gerar — acompanha o seletor "Quantos jogos". 'batch': o lote concreto em
   * tela, medido jogo a jogo (inclusive fechamento, com sobreposição).
   */
  scope: 'model' | 'batch';
}

/** Padrão das outras telas: formatador em escopo de módulo, não por render. */
const percent = (p: number): string => (p * 100).toFixed(2).replace('.', ',');

/**
 * A chance real do LOTE, não do jogo isolado — o número que o volante inteiro
 * tem de chance de premiar no mínimo a faixa mais baixa da modalidade.
 *
 * Calculado EXATAMENTE (`batchOdds.ts`, partições de Venn + fator de trevos),
 * não simulado. Como o `PayoutSharePanel`, carrega a ressalva no mesmo painel:
 * este é o teto estrutural do lote, idêntico para qualquer combinação — a
 * escolha de dezenas não o move; a estrutura (jogos disjuntos, duplas
 * distintas) só controla a variância. Sorteios são independentes.
 */
export default function BatchOddsPanel({ lottery, odds, scope }: BatchOddsPanelProps) {
  const { t } = useTranslation();
  const oneIn = Math.round(1 / odds.anyPrizeProbability).toLocaleString('pt-BR');
  // A faixa mais baixa é a última da lista (ordenada da mais alta para a mais baixa).
  const minimumTier = prizeTiers(lottery).slice(-1)[0];
  const dedupGain = odds.anyPrizeProbabilityRepeatedDuplas
    ? (odds.anyPrizeProbability - odds.anyPrizeProbabilityRepeatedDuplas) * 100
    : null;

  return (
    <Card variant="outlined" data-testid="batch-odds-panel">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CalculateIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t('batchOdds.title')}
          </Typography>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {scope === 'model'
            ? t('batchOdds.scopeModel', { games: odds.gamesCount })
            : t('batchOdds.scopeBatch', { games: odds.gamesCount })}
        </Typography>

        <Box aria-live="polite" sx={{ mt: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }} color="primary.main">
            {percent(odds.anyPrizeProbability)}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('batchOdds.anyPrizeLabel')} · {t('batchOdds.oneIn', { oneIn })}
          </Typography>
        </Box>

        <Stack spacing={0.75} sx={{ mt: 1.5 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              {t('batchOdds.expectedRow')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {odds.expectedPrizedGames.toFixed(3).replace('.', ',')}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              {t('batchOdds.concursosRow')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {concursosForNoPrize(odds.noPrizeProbability, 0.5).toLocaleString('pt-BR')}
            </Typography>
          </Stack>
          {dedupGain !== null && (
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                {t('batchOdds.dedupGainRow')}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {t('batchOdds.dedupGainValue', {
                  gain: dedupGain.toFixed(2).replace('.', ','),
                })}
              </Typography>
            </Stack>
          )}
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('batchOdds.minimumNote', { label: minimumTier.label })}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {t('batchOdds.disclaimer')}
        </Typography>
      </CardContent>
    </Card>
  );
}
