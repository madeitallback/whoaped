import type { Metadata } from "next";
import { TokenWorkspace } from "./token-workspace";

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
  const { mint } = await params;
  return { title: `Token intelligence — WHOAPED`, description: `Verified Pump and Fomo holders, positions, and thesis evidence for Solana token ${mint}.`, alternates: { canonical: `/token/${encodeURIComponent(mint)}` } };
}

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return <TokenWorkspace mint={mint} />;
}
