'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import NextLink from 'next/link';
import { useTranslation } from 'react-i18next';
import { PRIVACY_CONFIG } from '@/config/privacy';
import { CONSENT_CATEGORIES, ConsentCategory } from '@/services/consent';
import {
  buildLocalDataExport,
  clearLocalData,
  describeLocalData,
  LocalDataSummary,
} from '@/services/localData';
import { useConsent } from '@/components/consent/ConsentContext';

/**
 * Política de privacidade + painel de direitos do titular (LGPD Art. 18) em
 * uma rota única e acessível pelo rodapé, pelo banner e pela página Sobre.
 *
 * O painel (seção 7) é o self-service exigido pela diretriz de conformidade:
 * exportação interoperável (.json) e eliminação imediata dos dados locais —
 * o app não tem contas, então os direitos de acesso/portabilidade/eliminação/
 * revogação são exercidos direto no dispositivo, sem formulário e sem espera.
 */

const DATA_ROWS: Array<{ category: string; purpose: string; base: string }> = [
  {
    category: 'privacidade.dataPublic',
    purpose: 'privacidade.dataPublicPurpose',
    base: 'privacidade.dataPublicBase',
  },
  {
    category: 'privacidade.dataLocal',
    purpose: 'privacidade.dataLocalPurpose',
    base: 'privacidade.dataLocalBase',
  },
  {
    category: 'privacidade.dataErrors',
    purpose: 'privacidade.dataErrorsPurpose',
    base: 'privacidade.dataErrorsBase',
  },
  {
    category: 'privacidade.dataAnalytics',
    purpose: 'privacidade.dataAnalyticsPurpose',
    base: 'privacidade.dataAnalyticsBase',
  },
  {
    category: 'privacidade.dataPush',
    purpose: 'privacidade.dataPushPurpose',
    base: 'privacidade.dataPushBase',
  },
];

const RIGHTS: Array<string> = [
  'privacidade.rightAccess',
  'privacidade.rightRectify',
  'privacidade.rightRevoke',
  'privacidade.rightDelete',
  'privacidade.rightsAnpd',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }} gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export default function PrivacidadePage() {
  const { t } = useTranslation();
  const { state, openPreferences } = useConsent();

  const [summary, setSummary] = useState<LocalDataSummary | null>(null);
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // Resumo do que existe no dispositivo — depois da hidratação (o storage
  // não existe no servidor; sumário em `null` renderiza um "carregando").
  useEffect(() => {
    let cancelled = false;
    describeLocalData().then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalDraws = summary
    ? Object.values(summary.draws).reduce((acc, count) => acc + count, 0)
    : 0;

  const handleExport = useCallback(async () => {
    const data = await buildLocalDataExport();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `volante-plus-meus-dados-${date}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportedFilename(filename);
  }, []);

  const handleDelete = useCallback(async () => {
    setConfirmOpen(false);
    await clearLocalData();
    setDeleted(true);
    // Recarrega do zero: sem dados locais, sem preferências em memória — o
    // banner de consentimento volta porque a decisão também foi apagada
    // (revogação com efeito imediato).
    setTimeout(() => window.location.reload(), 1500);
  }, []);

  const totalConsented = state
    ? CONSENT_CATEGORIES.filter((category) => state[category]).length
    : 0;

  return (
    <Container component="main" maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {t('privacidade.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('privacidade.updatedAt', { date: PRIVACY_CONFIG.policyUpdatedAt })}
          </Typography>
        </Box>

        <Section title={t('privacidade.controllerTitle')}>
          <Typography variant="body2" color="text.secondary">
            {t('privacidade.controllerBody', {
              controller: PRIVACY_CONFIG.controllerName,
              email: PRIVACY_CONFIG.dpoEmail,
            })}
          </Typography>
        </Section>

        <Section title={t('privacidade.dataTitle')}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('privacidade.dataIntro')}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={t('privacidade.dataTitle')}>
              <TableHead>
                <TableRow>
                  <TableCell component="th" scope="col">
                    {t('privacidade.dataTableCategory')}
                  </TableCell>
                  <TableCell component="th" scope="col">
                    {t('privacidade.dataTablePurpose')}
                  </TableCell>
                  <TableCell component="th" scope="col">
                    {t('privacidade.dataTableBase')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {DATA_ROWS.map((row) => (
                  <TableRow key={row.category}>
                    <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                      {t(row.category)}
                    </TableCell>
                    <TableCell>{t(row.purpose)}</TableCell>
                    <TableCell>{t(row.base)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Section title={t('privacidade.thirdPartyTitle')}>
          <Typography variant="body2" color="text.secondary">
            {t('privacidade.thirdPartyBody')}
          </Typography>
        </Section>

        <Section title={t('privacidade.retentionTitle')}>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {t('privacidade.retentionBody1')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('privacidade.retentionBody2')}
            </Typography>
          </Stack>
        </Section>

        <Section title={t('privacidade.rightsTitle')}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('privacidade.rightsIntro', { email: PRIVACY_CONFIG.dpoEmail })}
          </Typography>
          <List disablePadding dense>
            {RIGHTS.map((right) => (
              <ListItem key={right} disableGutters>
                <ListItemText
                  primary={t(right)}
                  slotProps={{ primary: { variant: 'body2' } }}
                />
              </ListItem>
            ))}
          </List>
        </Section>

        <Section title={t('privacidade.prefsTitle')}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('privacidade.prefsBody')}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            {state === null ? (
              <Chip label={t('privacidade.prefsStateUndecided')} color="warning" size="small" />
            ) : (
              CONSENT_CATEGORIES.map((category: ConsentCategory) => (
                <Chip
                  key={category}
                  label={`${t(`consent.category.${category}`)}: ${
                    state[category] ? t('privacidade.prefsStateOn') : t('privacidade.prefsStateOff')
                  }`}
                  color={state[category] ? 'success' : 'default'}
                  size="small"
                />
              ))
            )}
            {state !== null && (
              <Chip
                label={`${totalConsented}/${CONSENT_CATEGORIES.length}`}
                variant="outlined"
                size="small"
              />
            )}
          </Stack>
          <Button variant="outlined" onClick={openPreferences}>
            {t('privacidade.prefsManage')}
          </Button>
        </Section>

        <Section title={t('privacidade.localDataTitle')}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('privacidade.localDataIntro')}
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="body2" component="p" color="text.secondary">
              {summary
                ? t('privacidade.localDataDraws', { count: totalDraws })
                : '…'}
              {' · '}
              {t('privacidade.localDataPerformances', { count: summary?.performances ?? 0 })}
              {' · '}
              {t('privacidade.localDataConfig', { count: summary?.config ?? 0 })}
              {' · '}
              {t('privacidade.localDataCaches', { count: summary?.caches.length ?? 0 })}
            </Typography>
          </Paper>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" onClick={handleExport}>
              {t('privacidade.exportButton')}
            </Button>
            <Button variant="contained" color="error" onClick={() => setConfirmOpen(true)}>
              {t('privacidade.deleteButton')}
            </Button>
          </Stack>
          {exportedFilename && (
            <Typography variant="body2" color="success.main" sx={{ mt: 1 }} role="status">
              {t('privacidade.exportDone', { filename: exportedFilename })}
            </Typography>
          )}
          {deleted && (
            <Typography variant="body2" color="success.main" sx={{ mt: 1 }} role="status">
              {t('privacidade.deleteDone')}
            </Typography>
          )}
        </Section>

        <Typography variant="body2" color="text.secondary">
          {t('sobre.privacyBody')}{' '}
          <Link component={NextLink} href="/sobre">
            {t('nav.sobre')}
          </Link>
        </Typography>
      </Stack>

      {/* Confirmação da eliminação: ação destrutiva merece barreira explícita. */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        aria-labelledby="delete-data-title"
      >
        <DialogTitle id="delete-data-title" component="h2" variant="h6">
          {t('privacidade.deleteConfirmTitle')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t('privacidade.deleteConfirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('privacidade.deleteConfirmCancel')}</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            {t('privacidade.deleteConfirmAccept')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
