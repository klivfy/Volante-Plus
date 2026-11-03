'use client';

import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';
import { PRIVACY_CONFIG } from '@/config/privacy';

/**
 * Rodapé global — canal de privacidade sempre visível (LGPD, diretriz §4.3):
 * link permanente para a política/canal do titular e contato do Encarregado
 * (DPO). Fica dentro de `#conteudo` no layout, acima do BottomNav fixo.
 */
export default function SiteFooter() {
  const { t } = useTranslation();

  return (
    <Container component="footer" maxWidth="md" sx={{ py: 3, mt: 2 }}>
      <Divider sx={{ mb: 2 }} />
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Link component={NextLink} href="/privacidade" variant="body2">
            {t('footer.privacyLink')}
          </Link>
          <Link href={`mailto:${PRIVACY_CONFIG.dpoEmail}`} variant="body2">
            {t('footer.dpoContact', { email: PRIVACY_CONFIG.dpoEmail })}
          </Link>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {t('footer.controllerNote', { controller: PRIVACY_CONFIG.controllerName })}
        </Typography>
      </Stack>
    </Container>
  );
}
