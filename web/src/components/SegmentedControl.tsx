'use client';

import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Rótulo acessível do grupo. */
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * Controle segmentado único do app: escolha exclusiva entre poucas opções
 * relacionadas (modalidade, modo, garantia, quantidade de jogos). Substitui os
 * três estilos que conviviam (chips, toggle em CAIXA ALTA e slider) — um só
 * componente, mesmo acabamento, alvos de 44 pt e o segmento ativo preenchido
 * com a cor da modalidade (ver `MuiToggleButton` em `theme.ts`).
 *
 * Nunca deixa "nenhum selecionado": clicar no segmento ativo é ignorado.
 */
export default function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(_, next: T | null) => {
        if (next !== null) onChange(next);
      }}
    >
      {options.map((option) => (
        <ToggleButton key={String(option.value)} value={option.value}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
