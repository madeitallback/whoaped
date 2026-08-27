import followerFixture from "./fixtures/followers-page.json";
import { describe, expect, it } from "vitest";
import { PumpFormatError, parsePumpFollowers, parsePumpProfile, stratifiedFollowerOffsets } from "./adapter";

describe("Pump follower adapter", () => {
  it("normalizes public Pump followers with verified wallets", () => {
    const followers = parsePumpFollowers(followerFixture);
    expect(followers).toHaveLength(3);
    expect(followers?.[0]).toMatchObject({
      handle: "oxr",
      verifiedWallet: "5WnAczezsDku4YkJEKW9PUzLm87Wuq6VKczLn8n2YHP2",
      resolutionStatus: "verified",
      followerCount: 1094903,
    });
  });

  it("deduplicates wallets and ignores invalid addresses", () => {
    const valid = followerFixture[0];
    const followers = parsePumpFollowers([valid, { ...valid, username: "renamed" }, { username: "bad", address: "not-a-wallet" }]);
    expect(followers).toHaveLength(1);
    expect(followers?.[0].handle).toBe("renamed");
  });

  it("distinguishes unavailable data from an empty list", () => {
    expect(parsePumpFollowers(null)).toBeNull();
    expect(parsePumpFollowers([])).toEqual([]);
  });

  it("fails loudly when Pump changes the payload shape", () => {
    expect(() => parsePumpFollowers({ followers: [] })).toThrow(PumpFormatError);
  });

  it("samples several depths instead of only the most-followed accounts", () => {
    expect(stratifiedFollowerOffsets(41_077, 20)).toEqual([
      { offset: 0, limit: 5 },
      { offset: 3332, limit: 5 },
      { offset: 6664, limit: 5 },
      { offset: 9996, limit: 5 },
    ]);
  });

  it("resolves a Pump profile only when the returned wallet matches", () => {
    const address = followerFixture[0].address;
    expect(parsePumpProfile({ address, userId: "stable-user-id", username: "oxr", followers: 100 }, address)).toMatchObject({
      platform: "pump",
      platformProfileId: "stable-user-id",
      primaryWallet: address,
      handle: "oxr",
      visibleFollowerCount: 100,
    });
    expect(() => parsePumpProfile({ address: followerFixture[1].address, userId: "stable-user-id" }, address)).toThrow(PumpFormatError);
  });
});
