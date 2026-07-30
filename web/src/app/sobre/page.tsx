import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export default function SobrePage() {
  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Sobre o Volante+
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Gerador estatístico para Mega-Sena e +Milionária. Sem palpite, sem número quente.
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
            Missão
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Usar o histórico das loterias para testar, validar ou refutar empiricamente modelos
            matemáticos via backtesting transparente — sem promessas de &quot;números quentes&quot;.
            Cada sorteio é um evento independente: nenhuma dezena carrega memória do que saiu antes.
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
            Como os jogos são gerados
          </Typography>
          <Typography variant="body2" color="text.secondary">
            O desempenho de cada dezena combina frequência real no histórico com uma simulação de
            Monte Carlo, e é classificado em três faixas — top, mid e low. A geração sorteia 70%
            das vagas do jogo na faixa top, 20% na mid e 10% na low, sempre com seleção
            proporcional ao peso dentro da faixa escolhida.
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
            Backtesting
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A tela de Backtesting mede o desempenho das dezenas apenas na janela de treino
            (concursos até a data de corte) e valida os jogos gerados contra os concursos reais
            posteriores. O resultado é comparado ao baseline hipergeométrico — a média de acertos
            que o acaso puro já entregaria. A expectativa é que o método não o supere de forma
            consistente: é exatamente essa a hipótese que o app existe para testar.
          </Typography>
        </Box>
      </Stack>
    </Container>
  );
}
