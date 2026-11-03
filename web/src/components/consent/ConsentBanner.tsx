'use client';

import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';
import { useConsent } from './ConsentContext';
import { BOTTOM_NAV_HEIGHT } from '@/components/navigation';

/**
 * Banner de consentimento LGPD — aparece SOMENTE quando o titular ainda não
 * decidiu (opt-in; nada de consentimento implícito por navegação).
 *
 * Requisitos da diretriz de conformidade (docs/CONFORMIDADE-LGPD.md, §2.1):
 * - "Rejeitar não essenciais" tem O MESMO peso visual e a mesma facilidade
 *   de acesso que "Aceitar todos": ambos `variant="contained"`, mesma
 *   altura, lado a lado — nada de rejeitar escondido em link apagado.
 * - "Preferências" abre o diálogo granular (categorias com switches
 *   desmarcados por padrão).
 * - Link direto e permanente para a Política de Privacidade.
 *
 * A11y: `component="aside"` com `aria-label` (não-modal — o conteúdo da
 * página continua navegável; a decisão nunca bloqueia o app), foco inicial
 * em "Aceitar todos" só quando o titular chega por teclado? Não: foco não é
 * movido programaticamente para não sequestrar o foco do teclado — o banner
 * fica no fluxo natural depois do conteúdo principal (SkipLink → conteúdo →
 * banner).
 */
export default function ConsentBanner() {
  const { t } = useTranslation();
  const { bannerVisible, saveGrants, openPreferences, closePreferences } = useConsent();

  if (!bannerVisible) return null;

  // Fecha o diálogo de preferências junto: uma decisão no banner resolve a
  // pendência inteira.
  const acceptAll = () => {
    saveGrants({ analiticos: true, diagnosticos: true, marketing: true });
    closePreferences();
  };
  const rejectNonEssential = () => {
    saveGrants({ analiticos: false, diagnosticos: false, marketing: false });
    closePreferences();
  };

  return (
    <Paper
      component="aside"
      aria-label={t('consent.bannerLabel')}
      elevation={8}
      square
      sx={{
        position: 'fixed',
        // Acima do BottomNav fixo (zIndex.appBar); + safe-area para iOS.
        bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar + 10,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Container maxWidth="md" sx={{ py: 1.5 }}>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            {t('consent.bannerBody')}{' '}
            <Link component={NextLink} href="/privacidade" sx={{ fontWeight: 600 }}>
              {t('consent.policyLink')}
            </Link>
          </Typography>
          <Divider />
          {/*
            Paridade de botões: mesma variante, mesma altura, mesma ordem de
            tabulação — rejeitar é tão fácil quanto aceitar.
          */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" onClick={acceptAll}>
              {t('consent.acceptAll')}
            </Button>
            <Button variant="contained" color="secondary" onClick={rejectNonEssential}>
              {t('consent.rejectNonEssential')}
            </Button>
            <Button variant="outlined" onClick={openPreferences}>
              {t('consent.preferences')}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Paper>
  );
}
