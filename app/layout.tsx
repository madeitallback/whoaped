import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WHO APED? — Solana holder scanner",
  description: "FOMO vs Pump.fun vs unknown-wallet buyer mix.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
