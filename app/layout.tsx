import type { Metadata } from "next";
import "./globals.css";
import "./discovery.css";

export const metadata: Metadata = {
  title: "WHOAPED",
  description: "Token, wallet, and follower intelligence for Solana traders.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
