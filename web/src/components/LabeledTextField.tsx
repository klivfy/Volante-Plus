'use client';

import Box from '@mui/material/Box';
import TextField, { TextFieldProps } from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId } from 'react';

export type LabeledTextFieldProps = Omit<TextFieldProps, 'label' | 'variant'> & {
  /** Rótulo visível, sempre acima do campo. */
  label: string;
};

/**
 * Campo de texto com o rótulo fixo acima, em vez do rótulo flutuante do MUI.
 *
 * WHY: o rótulo flutuante é posicionado com `transform` em px e corta com
 * reticências numa linha só. Com o texto a 200% ele ficava por cima do valor
 * digitado ("Data de corte" sobre a data) e saía cortado nos campos estreitos
 * ("Custo do bilhete (R$)" precisava de 302 px e tinha 173). Acima do campo, o
 * rótulo é texto comum: cresce e quebra linha como qualquer outro texto
 * (`docs/revisao-de-design-2026-10.md`, achado C1).
 *
 * O `<label htmlFor>` dá o nome acessível do campo; o texto de ajuda continua
 * ligado por `aria-describedby`, que o `TextField` monta a partir do `id`.
 */
export default function LabeledTextField({ label, id, sx, fullWidth = true, ...props }: LabeledTextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Box sx={sx}>
      <Typography
        component="label"
        htmlFor={inputId}
        variant="body2"
        sx={{ display: 'block', mb: 0.75, fontWeight: 500 }}
      >
        {label}
      </Typography>
      <TextField id={inputId} fullWidth={fullWidth} {...props} />
    </Box>
  );
}
