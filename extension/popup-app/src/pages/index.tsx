import dynamic from 'next/dynamic';
import Head from 'next/head';

/**
 * `PopupContent` importa `webextension-polyfill`, que lança
 * ("This script should only be loaded in a browser extension.") assim que o
 * módulo é avaliado fora de um contexto real de extensão — inclusive durante
 * o prerender do `next build` (`output: "export"` estaticiza toda página).
 * `ssr: false` pula esse componente inteiro do prerender: ele só é importado
 * e montado depois, no navegador, quando o popup já está rodando dentro da
 * extensão de verdade.
 */
const PopupContent = dynamic(() => import('../components/PopupContent'), { ssr: false });

export default function IndexPage() {
  return (
    <>
      <Head>
        <title>Volante+</title>
      </Head>
      <PopupContent />
    </>
  );
}
