'use client';

import GroupsIcon from '@mui/icons-material/Groups';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import {
  PAYOUT_DISCLAIMER,
  PayoutBatchAssessment,
  averageConditionalGain,
  averageRelativePopularity,
  betterThanAverageCount,
} from '../engine/payoutShare';
import { formatInteger, formatMultiplier, formatPercent } from '../lib/format';

export interface PayoutSharePanelProps {
  assessment: PayoutBatchAssessment;
}

/**
 * O único número desta página que a escolha de dezenas realmente move.
 *
 * A chance de ganhar é idêntica para qualquer combinação e nenhum algoritmo a
 * altera — o app inteiro parte disso. O que varia é com quantas pessoas o
 * prêmio seria dividido, porque as pessoas não escolhem ao acaso. Por isso a
 * ressalva vem no mesmo painel do número, nunca depois nem em outra tela: o
 * valor é real, mas mede outra coisa que não a chance de ganhar, e as duas
 * são fáceis de confundir. Ver `payoutShare.ts` para a derivação.
 *
 * Porta direta do `PayoutSharePanel` (Compose) do app Android.
 */
export default function PayoutSharePanel({ assessment }: PayoutSharePanelProps) {
  const { t } = useTranslation();
  const gain = averageConditionalGain(assessment);
  const positive = gain >= 0;
  const games = assessment.games.length;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <GroupsIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 700 }}>
            {t('payoutShare.title')}
          </Typography>
        </Stack>

        <Typography
          variant="h4"
          component="p"
          sx={{ fontWeight: 700, mt: 1 }}
          color={positive ? 'primary.main' : 'error.main'}
        >
          {formatPercent(gain, { signed: true })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {positive ? t('payoutShare.moreOnWin') : t('payoutShare.lessOnWin')}
        </Typography>

        <Stack spacing={0.75} sx={{ mt: 1.5 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              {t('payoutShare.betterThanAverage')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {t('payoutShare.betterThanAverageValue', {
                count: betterThanAverageCount(assessment),
                total: games,
              })}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              {t('payoutShare.relativePopularity')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {formatMultiplier(averageRelativePopularity(assessment))}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              {t('payoutShare.tickets')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {formatInteger(assessment.tickets)}
            </Typography>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary">
          {PAYOUT_DISCLAIMER}
        </Typography>
      </CardContent>
    </Card>
  );
}
