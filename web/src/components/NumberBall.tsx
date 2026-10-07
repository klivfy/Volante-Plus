import Box from '@mui/material/Box';

export interface NumberBallProps {
  number: number;
  size?: number;
}

/**
 * Círculo com a dezena, no estilo das bolinhas de sorteio de loteria.
 *
 * `size` é dado em px de referência (16 px = 1rem) e vira rem: a bola cresce
 * junto com a preferência de tamanho de texto. Em px fixos, com o texto a 200%
 * os dígitos enchiam a bola de borda a borda.
 */
export default function NumberBall({ number, size = 36 }: NumberBallProps) {
  const diameter = `${size / 16}rem`;
  return (
    <Box
      sx={{
        width: diameter,
        height: diameter,
        flexShrink: 0,
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
