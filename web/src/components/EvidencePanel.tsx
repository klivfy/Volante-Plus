'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { BayesEvidence, bayesVerdict } from '@/engine/bayesEvidence';
import { EvidenceSummary } from '@/engine/numberEvidence';
import { DrawSpace } from '@/engine/prizeRules';
import { formatDecimal, formatInteger, formatPowerOfTen, formatSignificant } from '@/lib/format';

export interface EvidencePanelProps {
  summary: EvidenceSummary;
  bayes?: BayesEvidence | null;
  /** Probabilidade de inclusão esperada por dezena sob acaso (K/N). */
  expectedShare?: number;
  /** `numbers` (padrão) ou `trevos`: muda só o vocabulário do texto. */
  space?: DrawSpace;
}

/** Fator de Bayes legível: potência de dez só quando o expoente é grande. */
function formatBayes(log10: number): string {
  if (Math.abs(log10) >= 3) return formatPowerOfTen(log10);
  return formatSignificant(Math.pow(10, log10));
}

const SEVERITY = {
  COMPATIVEL_COM_ACASO: 'success',
  DESVIO_SIGNIFICATIVO: 'warning',
  AMOSTRA_INSUFICIENTE: 'info',
} as const;

/** Porcentagem sem o símbolo (o texto traduzido já traz o "%"). */
const percent = (fraction: number): string => formatDecimal(fraction * 100, 1);

/**
 * Responde, com teste de hipótese, à pergunta que o ranking de frequência não
 * responde: alguma dezena se afasta do acaso? Ver `numberEvidence.ts`.
 *
 * O que importa fica sempre visível (o veredito em uma frase e, se houver, qual
 * dezena saiu do acaso); os números que sustentam a conclusão ficam atrás de
 * "Ver detalhes" — divulgação progressiva em vez de um bloco de estatística
 * sempre aberto.
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
  const testable = summary.verdict !== 'AMOSTRA_INSUFICIENTE';
  const hasDetails = testable || summary.minimumDetectableRelativeBias !== null;

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }} gutterBottom>
          {t(k('evidence.title'))}
        </Typography>
        <Alert severity={weak ? 'info' : SEVERITY[summary.verdict]} sx={{ mb: 1 }}>
          {t(k(`evidence.verdict.${verdictKey}`), {
            draws: summary.draws,
            count: summary.significantCount,
            total: summary.rows.length,
            minimum: summary.minimumDraws,
          })}
        </Alert>
        {flagged.length > 0 && (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t(k('evidence.flagged'), {
              list: flagged
                .map(
                  (r) =>
                    `${r.number} (${r.z > 0 ? t('evidence.above') : t('evidence.below')}, ${formatInteger(r.hitCount)} vs ${formatInteger(r.expected)})`,
                )
                .join('; '),
            })}
          </Typography>
        )}

        {hasDetails && (
          <Accordion
            disableGutters
            elevation={0}
            square
            // "Ver detalhes" é um controle, não um título: sem isto o MUI o
            // envolve num <h3> e ele aparece no esboço de títulos da tela.
            slotProps={{ heading: { component: 'div' } }}
            sx={{ mt: 1, bgcolor: 'transparent', '&::before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t('evidence.details')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              {testable && hottest && (
                <Typography variant="body2" color="text.secondary">
                  {t(k('evidence.hottest'), {
                    number: hottest.number,
                    hits: formatInteger(hottest.hitCount),
                    expected: formatInteger(hottest.expected),
                  })}
                </Typography>
              )}
              {summary.minimumDetectableRelativeBias !== null && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t(k('evidence.power'), {
                    bias: formatInteger(summary.minimumDetectableRelativeBias * 100),
                  })}
                </Typography>
              )}
              {bayes && bayes.draws > 0 && testable && (
                <>
                  <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
                    {t('evidence.bayesTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(k(`evidence.omnibus.${bayesVerdict(bayes.log10BfOmnibus)}`), {
                      power: formatPowerOfTen(Math.abs(bayes.log10BfOmnibus)),
                      ratio: formatInteger(Math.pow(10, -bayes.log10BfOmnibus)),
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
                        raw: percent(hottest.hitCount / summary.draws),
                        shrunk: percent(bayes.shrunkProbabilities[hottest.number - 1]),
                        expected: percent(expectedShare),
                      })}
                    </Typography>
                  )}
                </>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                {t(k('evidence.footnote'))}
              </Typography>
            </AccordionDetails>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
