import { afterEach, describe, expect, it } from "vitest";
import { openFomoStorageState, sanitizeFomoStorageState, sealFomoStorageState } from "./session-crypto";

const previousSecret = process.env.WORKER_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.WORKER_SECRET;
  else process.env.WORKER_SECRET = previousSecret;
});

describe("Fomo collector session encryption", () => {
  it("keeps only Fomo state and round-trips it through authenticated encryption", () => {
    process.env.WORKER_SECRET = "test-worker-secret-with-enough-entropy";
    const input = {
      cookies: [
        { name: "fomo", value: "secret", domain: ".fomo.family", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" as const },
        { name: "unrelated", value: "discard", domain: ".example.com", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" as const },
      ],
      origins: [
        { origin: "https://fomo.family", localStorage: [{ name: "privy", value: "opaque" }] },
        { origin: "https://example.com", localStorage: [{ name: "tracking", value: "discard" }] },
      ],
    };
    const sanitized = sanitizeFomoStorageState(input);
    expect(sanitized.cookies).toHaveLength(1);
    expect(sanitized.origins).toHaveLength(1);
    const sealed = sealFomoStorageState(sanitized);
    expect(sealed).not.toContain("secret");
    expect(openFomoStorageState(sealed)).toEqual(sanitized);
  });

  it("rejects a modified encrypted session", () => {
    process.env.WORKER_SECRET = "test-worker-secret-with-enough-entropy";
    const sealed = sealFomoStorageState({ cookies: [], origins: [{ origin: "https://fomo.family", localStorage: [{ name: "privy", value: "opaque" }] }] });
    expect(() => openFomoStorageState(`${sealed.slice(0, -1)}x`)).toThrow();
  });
});
