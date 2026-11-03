'use client';

import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';

/**
 * "Pular para o conteúdo": primeiro elemento focalizável da página. Só fica
 * visível ao receber foco via teclado — usuários de leitor de tela ou de
 * navegação por teclado não precisam tabular pelo BottomNav (4 itens) a cada
 * troca de página. O destino é o `#conteudo` no `layout.tsx`.
 */
export default function SkipLink() {
  const { t } = useTranslation();

  return (
    <Box
      component="a"
      href="#conteudo"
      sx={{
        position: 'absolute',
        left: -9999,
        top: 8,
        zIndex: (theme) => theme.zIndex.tooltip + 1,
        bgcolor: 'background.paper',
        color: 'primary.main',
        px: 2,
        py: 1,
        borderRadius: 1,
        boxShadow: 3,
        fontWeight: 700,
        '&:focus': { left: 8 },
      }}
    >
      {t('nav.skipToContent')}
    </Box>
  );
}
