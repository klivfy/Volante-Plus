'use client';

import { Component, ReactNode } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Textos do fallback — passados de fora porque `useTranslation` não funciona em class components. */
  title: string;
  body: string;
  retryLabel: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error Boundary global da árvore React. Só componentes de classe podem
 * implementar `getDerivedStateFromError`/`componentDidCatch` — não há
 * equivalente em hooks — por isso este é o único componente de classe do
 * projeto.
 *
 * TODO: encaminhar `componentDidCatch` para o Sentry quando o projeto
 * adotar telemetria de erros; por ora só loga no console.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error('ErrorBoundary capturou um erro:', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Stack spacing={2}>
          <Alert severity="error">
            <AlertTitle>{this.props.title}</AlertTitle>
            {this.props.body}
          </Alert>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={this.handleRetry}
            sx={{ alignSelf: 'flex-start' }}
          >
            {this.props.retryLabel}
          </Button>
        </Stack>
      </Container>
    );
  }
}

export default ErrorBoundary;
