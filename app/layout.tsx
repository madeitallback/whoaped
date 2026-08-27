import type { Metadata } from "next";
import "./globals.css";
import "./discovery.css";

export const metadata: Metadata = {
  title: "WHOAPED — Social intelligence for Solana",
  description: "See who aped, who held, what they said, and whether their followers win across Pump and Fomo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
