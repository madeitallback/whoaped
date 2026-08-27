import { TokenWorkspace } from "./token-workspace";

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return <TokenWorkspace mint={mint} />;
}
