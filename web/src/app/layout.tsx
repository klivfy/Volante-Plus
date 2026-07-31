import type { Metadata, Viewport } from "next";
import "@fontsource/open-sans/300.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/500.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/open-sans/800.css";
import "./globals.css";
import ThemeProvider from "./providers";
import BottomNav from "@/components/BottomNav";
import { BOTTOM_NAV_HEIGHT } from "@/components/navigation";

export const metadata: Metadata = {
  title: "Volante+ — Análise de Loterias",
  description:
    "Aplicação web para análise e geração de jogos de loterias usando backtesting e desempenho histórico",
  manifest: "/manifest.json",
  other: {
    // Ícone de "tile" ao fixar o PWA na tela Iniciar do Windows. Caminho
    // adaptado para /icon-144x144.png (em vez de /icons/icon-144.png) para
    // seguir a mesma convenção dos outros ícones do manifest, todos na raiz
    // de public/.
    "msapplication-TileImage": "/icon-144x144.png",
    "msapplication-TileColor": "#6750A4",
  },
};

// A partir do Next 16 `viewport` e `themeColor` saíram de `metadata` e passaram
// a ter um export próprio; deixá-los em `metadata` emite aviso e é ignorado.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFBFE" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1B1F" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div
            style={{
              paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
              minHeight: '100dvh',
            }}
          >
            {children}
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
