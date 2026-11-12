import { describe, expect, test } from "vitest";

import { normalizeEmail } from "./validation";

describe("normalizeEmail", () => {
  test("trims and lowercases an address", () => {
    expect(normalizeEmail("  Member@Example.ORG ")).toBe("member@example.org");
  });

  test.each([undefined, null, 42, "", "not-an-email", "a@b", "two words@example.org"])(
    "rejects %j",
    (value) => {
      expect(normalizeEmail(value)).toBeNull();
    },
  );

  test("rejects addresses longer than 254 characters", () => {
    expect(normalizeEmail(`${"a".repeat(250)}@example.org`)).toBeNull();
  });
});
