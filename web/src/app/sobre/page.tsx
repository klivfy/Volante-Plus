'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

export default function SobrePage() {
  const { t } = useTranslation();

  return (
    <Container component="main" maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {t('sobre.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('sobre.subtitle')}
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }} gutterBottom>
            {t('sobre.missionTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('sobre.missionBody')}
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }} gutterBottom>
            {t('sobre.howTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('sobre.howBody')}
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }} gutterBottom>
            {t('sobre.backtestTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('sobre.backtestBody')}
          </Typography>
        </Box>
      </Stack>
    </Container>
  );
}
