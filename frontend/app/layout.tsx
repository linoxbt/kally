import type { Metadata } from "next";
import "./globals.css";
import KallyWalletProvider from "@/components/KallyWalletProvider";

export const metadata: Metadata = {
  title: "Kally — AI benchmark prediction markets",
  description: "Take a position on the next AI breakthrough. Transparent benchmark markets powered by GenLayer.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><KallyWalletProvider>{children}</KallyWalletProvider></body>
    </html>
  );
}
