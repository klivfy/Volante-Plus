'use client';

import CalculateIcon from '@mui/icons-material/Calculate';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { BatchOdds, concursosForNoPrize } from '../engine/batchOdds';

export interface BatchOddsPanelProps {
  odds: BatchOdds;
  /** `model`: lote hipotético do tamanho escolhido; `batch`: lote em tela. */
  scope: 'model' | 'batch';
}

/** Alvo da fila de concursos: “~N concursos para 90% de chance de prêmio”. */
const CONCURSOS_TARGET = 0.9;

const percentFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const decimalFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const integerFormat = new Intl.NumberFormat('pt-BR');

/**
 * O que o LOTE pode dar — e nada além disso.
 *
 * As chances exibidas são exatas e dependem só da estrutura do lote: quantos
 * jogos, quanta sobreposição de dezenas, quais duplas de trevo. O valor é o
 * MESMO para qualquer combinação da mesma estrutura — sorteios são
 * independentes e uniformes —, por isso a ressalva vem no mesmo painel do
 * número (mesma lição do `PayoutSharePanel`): o teto é real, mas não é
 * previsão, e os dois são fáceis de confundir.
 */
export default function BatchOddsPanel({ odds, scope }: BatchOddsPanelProps) {
  const { t } = useTranslation();

  const anyPrize = odds.anyPrizeProbability;
  const oneIn = anyPrize > 0 ? Math.round(1 / anyPrize) : null;
  const concursos = concursosForNoPrize(odds.noPrizeProbability, CONCURSOS_TARGET);

  const rows: { label: string; value: string }[] = [
    {
      label: t('batchOdds.noPrizeRow'),
      value: `${percentFormat.format(odds.noPrizeProbability * 100)}%`,
    },
    {
      label: t('batchOdds.expectedRow'),
      value: decimalFormat.format(odds.expectedPrizedGames),
    },
    {
      label: t('batchOdds.concursosRow'),
      value:
        concursos === Infinity
          ? t('batchOdds.concursosInfinity')
          : `≈ ${integerFormat.format(concursos)}`,
    },
  ];

  return (
    <Card variant="outlined" data-testid="batch-odds-panel" aria-live="polite">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CalculateIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {scope === 'model'
              ? t('batchOdds.titleModel', { count: odds.gamesCount })
              : t('batchOdds.titleBatch', { count: odds.gamesCount })}
          </Typography>
        </Stack>

        <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>
          {percentFormat.format(anyPrize * 100)}%
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {oneIn === null
            ? t('batchOdds.noPrizeRow')
            : t('batchOdds.oneIn', { oneIn: integerFormat.format(oneIn) })}
        </Typography>

        <Divider sx={{ my: 1.5 }} />

        <Stack spacing={0.5}>
          {rows.map((row) => (
            <Stack
              key={row.label}
              direction="row"
              spacing={2}
              sx={{ justifyContent: 'space-between' }}
            >
              <Typography variant="body2" color="text.secondary">
                {row.label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {row.value}
              </Typography>
            </Stack>
          ))}
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {t('batchOdds.disclaimer')}
        </Typography>
      </CardContent>
    </Card>
  );
}
