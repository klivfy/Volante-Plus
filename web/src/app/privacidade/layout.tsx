import type { Metadata } from 'next';

/**
 * Metadados da rota /privacidade (o `page.tsx` é cliente — metadata precisa
 * de um layout servidor aqui). Título explícito ajuda o titular a achar a
 * política em histórico do navegador e resultados de busca.
 */
export const metadata: Metadata = {
  title: 'Privacidade e dados pessoais — Volante+',
  description:
    'Política de privacidade (LGPD) do Volante+: dados tratados, bases legais, direitos do titular (Art. 18) e ferramentas de exportação e exclusão dos dados locais.',
};

export default function PrivacidadeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
