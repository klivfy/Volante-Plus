'use client';

import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { EvidenceSummary } from '@/engine/numberEvidence';

export interface EvidencePanelProps {
  summary: EvidenceSummary;
}

const SEVERITY = {
  COMPATIVEL_COM_ACASO: 'success',
  DESVIO_SIGNIFICATIVO: 'warning',
  AMOSTRA_INSUFICIENTE: 'info',
} as const;

/**
 * Responde, com teste de hipótese, à pergunta que o ranking de frequência não
 * responde: alguma dezena se afasta do acaso? Ver `numberEvidence.ts`.
 */
export default function EvidencePanel({ summary }: EvidencePanelProps) {
  const { t } = useTranslation();
  const hottest = [...summary.rows].sort((a, b) => b.hitCount - a.hitCount)[0];

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>
          {t('evidence.title')}
        </Typography>
        <Alert severity={SEVERITY[summary.verdict]} sx={{ mb: 1 }}>
          {t(`evidence.verdict.${summary.verdict}`, {
            draws: summary.draws,
            count: summary.significantCount,
            minimum: summary.minimumDraws,
          })}
        </Alert>
        {summary.verdict !== 'AMOSTRA_INSUFICIENTE' && hottest && (
          <Typography variant="body2" color="text.secondary">
            {t('evidence.hottest', {
              number: hottest.number,
              hits: hottest.hitCount,
              expected: hottest.expected.toFixed(0),
              z: hottest.z.toFixed(1),
            })}
          </Typography>
        )}
        {summary.minimumDetectableRelativeBias !== null && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('evidence.power', {
              bias: (summary.minimumDetectableRelativeBias * 100).toFixed(0),
            })}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {t('evidence.footnote')}
        </Typography>
      </CardContent>
    </Card>
  );
}
