import type { Metadata, Viewport } from "next";
import "@fontsource/open-sans/300.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/500.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/open-sans/800.css";
import "./globals.css";
import ThemeProvider from "./providers";

export const metadata: Metadata = {
  title: "Volante+ — Análise de Loterias",
  description:
    "Aplicação web para análise e geração de jogos de loterias usando backtesting e desempenho histórico",
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
