import type { Metadata } from "next";
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
  description: "Aplicação web para análise e geração de jogos de loterias usando backtesting e desempenho histórico",
  viewport: "width=device-width, initial-scale=1.0, maximum-scale=5.0",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFBFE" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1B1F" },
  ],
  manifest: "/manifest.json",
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
