import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.whoaped.xyz"),
  title: "WHOAPED — Social intelligence for Solana",
  description: "See who aped, who held, what they said, and whether their followers win across Pump and Fomo.",
  alternates: { canonical: "/" },
  openGraph: { title: "WHOAPED — The KOLScan of social trading", description: "Pump and Fomo holders, positions, thesis evidence, and daily trader intelligence in one product.", url: "/", siteName: "WHOAPED", type: "website" },
  twitter: { card: "summary", title: "WHOAPED — The KOLScan of social trading", description: "See who aped, who held, and why across Pump and Fomo." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
