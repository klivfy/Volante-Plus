'use client';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import NumberBall from './NumberBall';
import { hasTrevos } from '../engine/prizeRules';
import { GeneratedGame, Lottery } from '../types/domain';

export interface GameCardProps {
  lottery: Lottery;
  game: GeneratedGame;
  /** 1-based, só para o rótulo ("Jogo 01"). */
  index: number;
  onCopy: (game: GeneratedGame) => void;
  onShare: (game: GeneratedGame) => void;
}

/** Card de um jogo gerado: dezenas, trevos (se houver) e ações de copiar/compartilhar. */
export default function GameCard({ lottery, game, index, onCopy, onShare }: GameCardProps) {
  const { t } = useTranslation();
  const showsTrevos = hasTrevos(lottery) && (game.trevoDuplas?.length ?? 0) > 0;

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {t('volante.gameLabel', { number: String(index).padStart(2, '0') })}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
          {game.numbers.map((number) => (
            <NumberBall key={number} number={number} />
          ))}
        </Stack>
        {showsTrevos && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
            {game.trevoDuplas!.map((dupla) => (
              <Chip
                key={dupla.join('-')}
                size="small"
                color="secondary"
                label={t('volante.trevosLabel', { numbers: dupla.join('-') })}
              />
            ))}
          </Stack>
        )}
      </CardContent>
      <CardActions>
        <IconButton aria-label={t('volante.copyGame')} onClick={() => onCopy(game)}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
        <IconButton aria-label={t('volante.shareGame')} onClick={() => onShare(game)}>
          <ShareIcon fontSize="small" />
        </IconButton>
      </CardActions>
    </Card>
  );
}
