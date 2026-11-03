import { memo } from 'react';
import Box from '@mui/material/Box';

export interface NumberBallProps {
  number: number;
  size?: number;
}

/**
 * Círculo com a dezena, no estilo das bolinhas de sorteio de loteria.
 * `memo`: a grade de dezenas é a folha mais numerosa da tela (até 15 por
 * jogo × dezenas de jogos) — re-render só quando a própria dezena muda.
 */
function NumberBall({ number, size = 36 }: NumberBallProps) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        fontWeight: 600,
        fontSize: size <= 28 ? '0.75rem' : '0.875rem',
      }}
    >
      {String(number).padStart(2, '0')}
    </Box>
  );
}

export default memo(NumberBall);
