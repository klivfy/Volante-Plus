'use client';

import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { MAX_GAMES, MIN_GAMES } from '../types/domain';

export interface GameSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const MARKS = Array.from({ length: MAX_GAMES - MIN_GAMES + 1 }, (_, i) => ({
  value: MIN_GAMES + i,
  label: `${MIN_GAMES + i}`,
}));

/** Slider MUI para escolher quantos jogos gerar, limitado a `MIN_GAMES..MAX_GAMES`. */
export default function GameSlider({ value, onChange }: GameSliderProps) {
  const { t } = useTranslation();

  return (
    <>
      <Typography variant="subtitle2" gutterBottom>
        {t('volante.howManyGames')}
      </Typography>
      <Slider
        value={value}
        onChange={(_, newValue) => onChange(newValue as number)}
        min={MIN_GAMES}
        max={MAX_GAMES}
        step={1}
        marks={MARKS}
        valueLabelDisplay="auto"
      />
    </>
  );
}
