import type { TokenSocialActor, TokenWalletActivity } from "@/lib/data/contracts";

export type UnifiedTokenHolder = {
  wallet: string;
  position: TokenWalletActivity;
  profiles: TokenSocialActor[];
};

export function mergeTokenHolders(positions: TokenWalletActivity[], actors: TokenSocialActor[]): UnifiedTokenHolder[] {
  const profilesByWallet = new Map<string, Map<string, TokenSocialActor>>();
  for (const actor of actors) {
    const profiles = profilesByWallet.get(actor.wallet) ?? new Map<string, TokenSocialActor>();
    profiles.set(`${actor.platform}:${actor.platformProfileId}`, actor);
    profilesByWallet.set(actor.wallet, profiles);
  }

  return positions
    .filter((position) => position.balanceUi > 0)
    .map((position) => ({
      wallet: position.wallet,
      position,
      profiles: [...(profilesByWallet.get(position.wallet)?.values() ?? [])]
        .sort((left, right) => left.platform.localeCompare(right.platform)),
    }))
    .sort((left, right) => right.position.balanceUi - left.position.balanceUi);
}
