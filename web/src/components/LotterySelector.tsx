'use client';

import { useTranslation } from 'react-i18next';
import { Lottery } from '../types/domain';
import SegmentedControl from './SegmentedControl';

export interface LotterySelectorProps {
  value: Lottery;
  onChange: (lottery: Lottery) => void;
  disabled?: boolean;
}

/** Seletor de modalidade: controle segmentado (mesmo estilo dos demais seletores do app). */
export default function LotterySelector({ value, onChange, disabled = false }: LotterySelectorProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={t('volante.lotterySelectorLabel')}
      options={[
        { value: Lottery.MEGA_SENA, label: t('lottery.megaSena') },
        { value: Lottery.MAIS_MILIONARIA, label: t('lottery.maisMilionaria') },
        { value: Lottery.QUINA, label: t('lottery.quina') },
      ]}
    />
  );
}
