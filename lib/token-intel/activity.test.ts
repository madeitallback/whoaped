import { describe, expect, it } from "vitest";
import { positionStatus } from "./activity";

describe("token position status", () => {
  it.each([
    [10, 0, "holding"],
    [10, 2, "trimmed"],
    [0, 1, "exited"],
    [0, 0, "not_held"],
  ] as const)("classifies balance %s with %s sells as %s", (balance, sells, expected) => {
    expect(positionStatus(balance, sells)).toBe(expected);
  });
});
