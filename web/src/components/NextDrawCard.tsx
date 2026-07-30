'use client';

import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { NextDrawInfo } from '../types/domain';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Algumas fontes trazem só a data (sem horário), outras trazem data e hora do
 * sorteio. Meia-noite exata é ambígua demais para exibir como "hora do
 * sorteio" — nesse caso mostramos só a data.
 */
function formatDrawMoment(drawDate: string): { date: string; time: string | null } {
  const parsed = new Date(drawDate.length <= 10 ? `${drawDate}T00:00:00` : drawDate);
  const hasTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0;
  return {
    date: dateFormatter.format(parsed),
    time: hasTime ? timeFormatter.format(parsed) : null,
  };
}

export interface NextDrawCardProps {
  nextDraw: NextDrawInfo | null;
  loading: boolean;
}

export default function NextDrawCard({ nextDraw, loading }: NextDrawCardProps) {
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
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <CloudOffIcon color="disabled" />
            <Typography variant="body2" color="text.secondary">
              Não foi possível carregar os dados do próximo concurso. Verifique sua conexão.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  const { date, time } = formatDrawMoment(nextDraw.drawDate);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <CalendarMonthIcon color="primary" sx={{ mt: 0.5 }} />
          <Stack spacing={0.25}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Concurso {nextDraw.contestNumber}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {time ? `${date} às ${time}` : date}
            </Typography>
            <Typography variant="h6" color="primary" sx={{ mt: 0.5 }}>
              {currencyFormatter.format(nextDraw.estimatedPrize)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              prêmio estimado
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
