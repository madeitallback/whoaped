import { describe, expect, it } from "vitest";
import { normalizeFomoHandle, parseFomoScanUser, parseVisibleFomoFollowers } from "./adapter";

describe("Fomo adapter", () => {
  it("parses a stable FomoScan identity and verified wallet", () => {
    expect(parseFomoScanUser({ id: "stable-id", handle: "FrankDeGods", name: "Frank", solanaAddress: "5WnAczezsDku4YkJEKW9PUzLm87Wuq6VKczLn8n2YHP2" })).toMatchObject({ id: "stable-id", handle: "FrankDeGods", solanaAddress: "5WnAczezsDku4YkJEKW9PUzLm87Wuq6VKczLn8n2YHP2" });
  });

  it("keeps a known identity unresolved when FomoScan has no wallet", () => {
    expect(parseFomoScanUser({ id: "stable-id", handle: "trader", name: null, solanaAddress: null }).solanaAddress).toBeNull();
  });

  it("deduplicates and validates only visible profile handles", () => {
    expect(parseVisibleFomoFollowers(["@Alice", { handle: "alice" }, { handle: "bob_1" }, "bad handle", null])).toEqual(["Alice", "bob_1"]);
    expect(normalizeFomoHandle("@valid.handle")).toBe("valid.handle");
  });
});
