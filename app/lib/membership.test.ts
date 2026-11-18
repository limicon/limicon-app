import { describe, expect, test } from "vitest";

import { membershipStatus } from "./membership";

describe("membershipStatus", () => {
  test("a visitor is signed out, whatever else is true", () => {
    expect(membershipStatus({ signedIn: false, hasTicket: true, isAdmin: true })).toBe("signed-out");
  });

  test("an account without a ticket needs one", () => {
    expect(membershipStatus({ signedIn: true, hasTicket: false, isAdmin: false })).toBe("needs-ticket");
  });

  test("a ticket holder is a member", () => {
    expect(membershipStatus({ signedIn: true, hasTicket: true, isAdmin: false })).toBe("member");
  });

  test("an admin is a member without a ticket", () => {
    expect(membershipStatus({ signedIn: true, hasTicket: false, isAdmin: true })).toBe("member");
  });

  test("a deactivated account opens nothing, even with a ticket", () => {
    expect(membershipStatus({ signedIn: true, hasTicket: true, isAdmin: false, deactivated: true })).toBe("deactivated");
  });
});
