'use client';

import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

export interface NumberPickerProps {
  universe: number;
  selected: readonly number[];
  max: number;
  onChange: (selected: number[]) => void;
  disabled?: boolean;
}

/** Volante para marcar dezenas (modo Fechamento), limitado a `max` marcações. */
export default function NumberPicker({
  universe,
  selected,
  max,
  onChange,
  disabled = false,
}: NumberPickerProps) {
  const { t } = useTranslation();
  const chosen = new Set(selected);

  function toggle(n: number): void {
    if (chosen.has(n)) {
      onChange(selected.filter((x) => x !== n));
    } else if (selected.length < max) {
      onChange([...selected, n].sort((a, b) => a - b));
    }
  }

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {t('fechamento.pickLabel', { count: selected.length, max })}
      </Typography>
      <Box
        role="group"
        aria-label={t('fechamento.pickAria')}
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 0.5 }}
      >
        {Array.from({ length: universe }, (_, i) => i + 1).map((n) => {
          const isOn = chosen.has(n);
          return (
            <ToggleButton
              key={n}
              value={n}
              selected={isOn}
              size="small"
              disabled={disabled || (!isOn && selected.length >= max)}
              onChange={() => toggle(n)}
              aria-label={String(n)}
              sx={{ px: 0, minWidth: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {String(n).padStart(2, '0')}
            </ToggleButton>
          );
        })}
      </Box>
    </Box>
  );
}
