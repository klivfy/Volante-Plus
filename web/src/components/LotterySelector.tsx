'use client';

import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import { useTranslation } from 'react-i18next';
import { Lottery } from '../types/domain';

export interface LotterySelectorProps {
  value: Lottery;
  onChange: (lottery: Lottery) => void;
}

const OPTIONS = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

/** Seletor de loteria via `Chip` filtrável do MUI — alternativa compacta às `Tabs`. */
export default function LotterySelector({ value, onChange }: LotterySelectorProps) {
  const { t } = useTranslation();
  const label: Record<Lottery, string> = {
    [Lottery.MEGA_SENA]: t('lottery.megaSena'),
    [Lottery.MAIS_MILIONARIA]: t('lottery.maisMilionaria'),
  };

  return (
    <Stack direction="row" spacing={1}>
      {OPTIONS.map((lottery) => (
        <Chip
          key={lottery}
          label={label[lottery]}
          color={value === lottery ? 'primary' : 'default'}
          variant={value === lottery ? 'filled' : 'outlined'}
          onClick={() => onChange(lottery)}
        />
      ))}
    </Stack>
  );
}
