import Box from '@mui/material/Box';

export interface NumberBallProps {
  number: number;
  size?: number;
}

/** Círculo com a dezena, no estilo das bolinhas de sorteio de loteria. */
export default function NumberBall({ number, size = 36 }: NumberBallProps) {
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
