'use client';

import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { NextDrawInfo } from '../types/domain';
import { formatDrawMoment } from './drawMoment';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export interface NextDrawCardProps {
  nextDraw: NextDrawInfo | null;
  loading: boolean;
}

export default function NextDrawCard({ nextDraw, loading }: NextDrawCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="40%" />
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (!nextDraw) {
    // Sem os dados do próximo concurso não há ação a tomar: uma linha discreta,
    // não um cartão que empurra a tarefa principal para baixo.
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CloudOffIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">
          {t('nextDraw.unavailable')}
        </Typography>
      </Stack>
    );
  }

  const { date, time } = formatDrawMoment(nextDraw.drawDate);
  const isAccumulated = nextDraw.estimatedPrize > 0;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <CalendarMonthIcon color="primary" sx={{ mt: 0.5 }} />
          <Stack spacing={0.25} sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {/* Título de seção real (h2): `subtitle1` sozinho renderiza <h6>
                  e quebrava a ordem de headings (audit heading-order). */}
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                {t('nextDraw.contest', { number: nextDraw.contestNumber })}
              </Typography>
              {isAccumulated && (
                <Chip
                  label={t('nextDraw.accumulated')}
                  size="small"
                  color="error"
                  variant="filled"
                  sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {time ? t('nextDraw.at', { date, time }) : date}
            </Typography>
            {/* Valor, não título: `component="p"` evita o salto h1→h6 que
                reprovava o audit `heading-order` do Lighthouse. */}
            <Typography variant="h6" component="p" color="primary" sx={{ mt: 0.5 }}>
              {currencyFormatter.format(nextDraw.estimatedPrize)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('nextDraw.estimatedPrize')}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
