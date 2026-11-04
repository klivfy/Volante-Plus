import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ThemeProvider from "./providers";
import BottomNav from "@/components/BottomNav";
import SkipLink from "@/components/SkipLink";
import SplashScreen from "@/components/SplashScreen";
import SiteFooter from "@/components/SiteFooter";
import PlausibleScript from "@/components/PlausibleScript";
import { BOTTOM_NAV_HEIGHT } from "@/components/navigation";

/**
 * Google Sans Flex (OFL-1.1, ver `src/fonts/OFL.txt`): variável 100–900,
 * auto-hospedada. O `next/font/local` injeta o `@font-face` com preload e
 * cria a variável `--font-google-sans-flex` no `<html>`, consumida pela
 * pilha tipográfica do tema (`theme.ts`). Auto-hospedar mantém o app sem
 * requisição de fonte a terceiros (LGPD) e funcional offline (PWA).
 */
const googleSansFlex = localFont({
  src: "../fonts/GoogleSansFlex.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-google-sans-flex",
});

export const metadata: Metadata = {
  title: "Volante+ — Análise de Loterias",
  description:
    "Aplicação web para análise e geração de jogos de loterias usando backtesting e desempenho histórico",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Volante+",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
  other: {
    // Ícone de "tile" ao fixar o PWA na tela Iniciar do Windows. Caminho
    // adaptado para /icon-144x144.png (em vez de /icons/icon-144.png) para
    // seguir a mesma convenção dos outros ícones do manifest, todos na raiz
    // de public/.
    "msapplication-TileImage": "/icon-144x144.png",
    // Cor da marca (verde Mega-Sena, `theme.ts#BRAND`), não o roxo padrão do
    // scaffold MUI — o tile do Windows com a cor antiga destoava do app.
    "msapplication-TileColor": "#2B8300",
  },
};

// A partir do Next 16 `viewport` e `themeColor` saíram de `metadata` e passaram
// a ter um export próprio; deixá-los em `metadata` emite aviso e é ignorado.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FEF7FF" },
    { media: "(prefers-color-scheme: dark)", color: "#141218" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={googleSansFlex.variable} suppressHydrationWarning>
      <body>
        {/* LGPD: o script de métricas (Plausible) saiu do <head> estático —
            agora é injetado SOMENTE com consentimento da categoria
            `analiticos`, via componente cliente (ver PlausibleScript). */}
        <PlausibleScript />
        <ThemeProvider>
          <SkipLink />
          <SplashScreen />
          {/* `id="conteudo"` + tabIndex={-1}: destino do skip link — o foco
              vai direto ao conteúdo, sem passar pelo BottomNav. */}
          <div
            id="conteudo"
            tabIndex={-1}
            style={{
              paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
              minHeight: '100dvh',
            }}
          >
            {children}
            <SiteFooter />
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
