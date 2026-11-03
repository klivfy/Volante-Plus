'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONSENT_CATEGORIES, ConsentCategory, ConsentGrants, defaultGrants } from '@/services/consent';
import { useConsent } from './ConsentContext';

/**
 * Diálogo de preferências de consentimento — granularidade por finalidade.
 *
 * Regras LGPD implementadas:
 * - NENHUM switch nasce pré-marcado: ao abrir sem decisão prévia, todas as
 *   categorias começam DESLIGADAS (`defaultGrants()`). Com decisão prévia,
 *   os switches refletem o que o titular já escolheu (para poder mudar).
 * - "Necessários" aparece como categoria sempre ativa e NÃO editável:
 *   armazenamento estritamente necessário (sessão, preferências, IndexedDB
 *   funcional) não depende de consentimento e não pode ser desligado —
 *   comunicar isso evita a ilusão de que o app funciona sem ele.
 * - A categoria `marketing` é exibida mesmo sem nenhum script registrado:
 *   o titular vê que a categoria existe e que NADA roda nela (transparência
 *   e base para integrações futuras).
 * - "Salvar preferências" aplica exatamente o estado dos switches — sem
 *   atalho que ligue tudo por cima da escolha granular.
 */
export default function ConsentPreferencesDialog() {
  const { t } = useTranslation();
  const { state, preferencesOpen, closePreferences, saveGrants, revokeAll } = useConsent();
  // Rascunho local: só vira decisão em "Salvar" — navegar entre switches sem
  // comprometer nada é parte do consentimento livre e informado.
  const [draft, setDraft] = useState<ConsentGrants>(defaultGrants);
  // Padrão "ajustar estado durante a renderização" (react.dev/learn/you-might-
  // not-need-an-effect): reabrir o diálogo reinicia o rascunho — decisão
  // prévia é pré-carregada; ausência de decisão deixa tudo desligado (nunca
  // pré-marcado). Feito na render (não em useEffect) para não causar renders
  // em cascata — e é o que o lint react-hooks exige.
  const [wasOpen, setWasOpen] = useState(false);
  if (preferencesOpen !== wasOpen) {
    setWasOpen(preferencesOpen);
    if (preferencesOpen) {
      if (state) {
        const { analiticos, diagnosticos, marketing } = state;
        setDraft({ analiticos, diagnosticos, marketing });
      } else {
        setDraft(defaultGrants());
      }
    }
  }

  const save = () => {
    saveGrants(draft);
    closePreferences();
  };

  const rejectNonEssential = () => {
    saveGrants(defaultGrants());
    closePreferences();
  };

  const acceptAll = () => {
    saveGrants({ analiticos: true, diagnosticos: true, marketing: true });
    closePreferences();
  };

  return (
    <Dialog
      open={preferencesOpen}
      onClose={closePreferences}
      aria-labelledby="consent-preferences-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="consent-preferences-title" component="h2" variant="h6">
        {t('consent.dialogTitle')}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('consent.dialogIntro')}
        </Typography>
        <List disablePadding>
          <ListItem disableGutters divider>
            <ListItemText
              primary={t('consent.categoryNecessary')}
              secondary={t('consent.categoryNecessaryDesc')}
            />
            <Switch checked disabled aria-label={t('consent.categoryNecessary')} />
          </ListItem>
          {/*
            Ordem fixa das categorias (CONSENT_CATEGORIES): analíticos,
            diagnósticos, marketing. Cada uma com descrição honesta do que é
            coletado quando ligada.
          */}
          {CONSENT_CATEGORIES.map((category: ConsentCategory) => (
            <ListItem key={category} disableGutters divider>
              <ListItemText
                primary={t(`consent.category.${category}`)}
                secondary={t(`consent.categoryDesc.${category}`)}
              />
              <Switch
                checked={draft[category]}
                onChange={(_event, checked) => setDraft((current) => ({ ...current, [category]: checked }))}
                slotProps={{ input: { 'aria-label': t(`consent.category.${category}`) } }}
              />
            </ListItem>
          ))}
        </List>
        <Divider sx={{ mt: 2 }} />
        <Stack spacing={1} sx={{ mt: 2 }}>
          <Button fullWidth variant="outlined" onClick={revokeAll}>
            {t('consent.revokeNow')}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', px: 3, pb: 2, gap: 1 }}>
        <Button variant="contained" onClick={save}>
          {t('consent.savePreferences')}
        </Button>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
          <Button variant="outlined" onClick={acceptAll}>
            {t('consent.acceptAll')}
          </Button>
          <Button variant="outlined" color="secondary" onClick={rejectNonEssential}>
            {t('consent.rejectNonEssential')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
