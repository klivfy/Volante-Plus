'use client';

import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { MAX_GAMES, MIN_GAMES } from '../types/domain';
import SegmentedControl from './SegmentedControl';

export interface GameCountControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const OPTIONS = Array.from({ length: MAX_GAMES - MIN_GAMES + 1 }, (_, i) => ({
  value: MIN_GAMES + i,
  label: String(MIN_GAMES + i),
}));

/**
 * Quantos jogos gerar, de `MIN_GAMES` a `MAX_GAMES` (2 a 4). São poucos valores
 * discretos, então um controle segmentado no lugar do slider: alvos de 44 pt e
 * o valor visível sem arrastar (o polegar do slider tinha 20 pt).
 */
export default function GameCountControl({ value, onChange, disabled = false }: GameCountControlProps) {
  const { t } = useTranslation();
  return (
    <>
      <Typography id="game-count-label" variant="subtitle2" gutterBottom>
        {t('volante.howManyGames')}
      </Typography>
      <SegmentedControl
        value={value}
        options={OPTIONS}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={t('volante.howManyGames')}
      />
    </>
  );
}
