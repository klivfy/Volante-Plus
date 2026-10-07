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

/**
 * Volante para marcar dezenas (modo Fechamento), limitado a `max` marcações.
 *
 * Alvos de 44 pt e 8 pt de folga (antes 29 × 36 com 4 pt). No celular são 5
 * colunas — cada célula tem ~65 × 44 pt; a partir de telas médias voltam as 10
 * colunas do volante impresso. O trade-off é perder a semelhança com o volante
 * físico no celular em troca de alvos que cabem no dedo.
 */
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
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(5, minmax(0, 1fr))', sm: 'repeat(10, minmax(0, 1fr))' },
          gap: 1,
        }}
      >
        {Array.from({ length: universe }, (_, i) => i + 1).map((n) => {
          const isOn = chosen.has(n);
          return (
            <ToggleButton
              key={n}
              value={n}
              selected={isOn}
              disabled={disabled || (!isOn && selected.length >= max)}
              onChange={() => toggle(n)}
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
