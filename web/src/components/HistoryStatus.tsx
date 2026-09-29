'use client';

import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useHistorySummary } from '@/hooks/useHistorySummary';
import { Lottery } from '@/types/domain';

export interface HistoryStatusProps {
  lottery: Lottery;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Mostra o que a análise está usando: de qual concurso a qual, até que data, e
 * se está completo e em dia. É o contrato de "histórico desde o 1º concurso e
 * sempre no último" tornado visível — e mostra quando NÃO está cumprindo
 * (lacunas, sem conseguir consultar a fonte).
 */
export default function HistoryStatus({ lottery }: HistoryStatusProps) {
  const { t } = useTranslation();
  const summary = useHistorySummary(lottery);
  if (!summary || summary.lastContest === null) return null;

  const range = {
    first: summary.firstContest,
    last: summary.lastContest,
    count: summary.count.toLocaleString('pt-BR'),
    date: formatDate(summary.lastDate),
  };

  if (summary.missing.length > 0) {
    return (
      <Alert severity="warning">
        {t('history.gaps', { ...range, missing: summary.missing.length })}
      </Alert>
    );
  }
  if (summary.reachable === false) {
    return (
      <Typography variant="caption" color="text.secondary" component="p">
        {t('history.offline', range)}
      </Typography>
    );
  }
  return (
    <Typography variant="caption" color="text.secondary" component="p">
      {summary.upToDate ? t('history.upToDate', range) : t('history.checking', range)}
    </Typography>
  );
}
