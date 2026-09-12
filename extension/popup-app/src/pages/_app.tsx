import type { AppProps } from 'next/app';
import '../styles/globals.css';

/**
 * Pages Router (não App Router) de propósito: o export estático do App Router
 * embute o payload de hidratação em `<script>` **inline** (`self.__next_f.push(...)`),
 * e páginas de extensão MV3 têm uma CSP fixa `script-src 'self'` — sem
 * `unsafe-inline`, sem exceção possível via manifest. O Pages Router só usa
 * `<script src="...">` externos mais um bloco `__NEXT_DATA__` do tipo
 * `application/json` (não executado, então a CSP não se aplica) — compatível
 * com o popup de uma extensão.
 */
export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
