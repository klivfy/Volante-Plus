'use client';

import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { BayesEvidence, bayesVerdict } from '@/engine/bayesEvidence';
import { EvidenceSummary } from '@/engine/numberEvidence';
import { DrawSpace } from '@/engine/prizeRules';

export interface EvidencePanelProps {
  summary: EvidenceSummary;
  bayes?: BayesEvidence | null;
  /** Probabilidade de inclusão esperada por dezena sob acaso (K/N). */
  expectedShare?: number;
  /** `numbers` (padrão) ou `trevos`: muda só o vocabulário do texto. */
  space?: DrawSpace;
}

/** Fator de Bayes legível: `10^x` só quando o expoente é grande. */
function formatBayes(log10: number): string {
  const abs = Math.abs(log10);
  if (abs >= 3) return `10^${log10 > 0 ? '' : '−'}${abs.toFixed(0)}`;
  return (Math.pow(10, log10)).toPrecision(2).replace('.', ',');
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
export default function EvidencePanel({
  summary,
  bayes,
  expectedShare,
  space = 'numbers',
}: EvidencePanelProps) {
  const { t } = useTranslation();
  // Trevos usam o mesmo texto com o vocabulário trocado (chaves `*_trevo`).
  const k = (key: string): string => (space === 'trevos' ? `${key}_trevo` : key);
  const hottest = [...summary.rows].sort((a, b) => b.hitCount - a.hitCount)[0];
  // Sem poder para detectar viés moderado (< 60% numa dezena), "compatível com
  // o acaso" não é um "não": é ausência de evidência, e o texto tem de dizer isso.
  const weak =
    summary.verdict === 'COMPATIVEL_COM_ACASO' &&
    summary.minimumDetectableRelativeBias !== null &&
    summary.minimumDetectableRelativeBias > 0.6;
  const verdictKey = weak ? 'COMPATIVEL_POUCO_PODER' : summary.verdict;
  const flagged = summary.rows.filter((r) => r.significant);

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>
          {t(k('evidence.title'))}
        </Typography>
        <Alert severity={weak ? 'info' : SEVERITY[summary.verdict]} sx={{ mb: 1 }}>
          {t(k(`evidence.verdict.${verdictKey}`), {
            draws: summary.draws,
            count: summary.significantCount,
            minimum: summary.minimumDraws,
          })}
        </Alert>
        {flagged.length > 0 && (
          <Typography variant="body2" sx={{ fontWeight: 600 }} gutterBottom>
            {t(k('evidence.flagged'), {
              list: flagged
                .map((r) => `${r.number} (${r.z > 0 ? t('evidence.above') : t('evidence.below')}, ${r.hitCount} vs ${r.expected.toFixed(0)})`)
                .join('; '),
            })}
          </Typography>
        )}
        {summary.verdict !== 'AMOSTRA_INSUFICIENTE' && hottest && (
          <Typography variant="body2" color="text.secondary">
            {t(k('evidence.hottest'), {
              number: hottest.number,
              hits: hottest.hitCount,
              expected: hottest.expected.toFixed(0),
              z: hottest.z.toFixed(1),
            })}
          </Typography>
        )}
        {summary.minimumDetectableRelativeBias !== null && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t(k('evidence.power'), {
              bias: (summary.minimumDetectableRelativeBias * 100).toFixed(0),
            })}
          </Typography>
        )}
        {bayes && bayes.draws > 0 && summary.verdict !== 'AMOSTRA_INSUFICIENTE' && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1.5 }}>
              {t('evidence.bayesTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(k(`evidence.omnibus.${bayesVerdict(bayes.log10BfOmnibus)}`), {
                exp: Math.abs(bayes.log10BfOmnibus).toFixed(0),
                ratio: Math.pow(10, -bayes.log10BfOmnibus).toFixed(0),
                bf: formatBayes(bayes.log10BfOmnibus),
              })}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t(k(`evidence.sparse.${bayesVerdict(bayes.log10BfSparse)}`), {
                bf: formatBayes(bayes.log10BfSparse),
              })}
            </Typography>
            {expectedShare !== undefined && hottest && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t(k('evidence.shrunk'), {
                  raw: ((hottest.hitCount / summary.draws) * 100).toFixed(1).replace('.', ','),
                  shrunk: (bayes.shrunkProbabilities[hottest.number - 1] * 100)
                    .toFixed(1)
                    .replace('.', ','),
                  expected: (expectedShare * 100).toFixed(1).replace('.', ','),
                })}
              </Typography>
            )}
          </>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {t(k('evidence.footnote'))}
        </Typography>
      </CardContent>
    </Card>
  );
}
