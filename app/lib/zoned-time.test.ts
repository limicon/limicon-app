import { describe, expect, test } from "vitest";

import { instantToZoned, isValidTimeZone, zonedToInstant } from "./zoned-time";

const iso = (value: Date | "nonexistent") => (value instanceof Date ? value.toISOString() : value);

describe("zonedToInstant", () => {
  test("converts a clock time in a zone to the instant", () => {
    expect(iso(zonedToInstant("2027-03-10", "12:00", "America/Toronto"))).toBe("2027-03-10T17:00:00.000Z");
    expect(iso(zonedToInstant("2027-03-10", "12:00", "Europe/London"))).toBe("2027-03-10T12:00:00.000Z");
  });

  test("follows each 2027 clock change around the event", () => {
    // 14 March: the US and Canada move to daylight time.
    expect(iso(zonedToInstant("2027-03-17", "12:00", "America/Toronto"))).toBe("2027-03-17T16:00:00.000Z");
    // 28 March: the UK moves to summer time.
    expect(iso(zonedToInstant("2027-03-29", "12:00", "Europe/London"))).toBe("2027-03-29T11:00:00.000Z");
    // 4 April: south-eastern Australia leaves daylight time.
    expect(iso(zonedToInstant("2027-04-03", "12:00", "Australia/Sydney"))).toBe("2027-04-03T01:00:00.000Z");
    expect(iso(zonedToInstant("2027-04-05", "12:00", "Australia/Sydney"))).toBe("2027-04-05T02:00:00.000Z");
  });

  test("rejects a clock time skipped when clocks go forward", () => {
    expect(zonedToInstant("2027-03-14", "02:30", "America/Toronto")).toBe("nonexistent");
  });

  test("takes the earlier instant for a clock time that happens twice", () => {
    // 7 November 2027: Toronto's 01:30 happens first in daylight time (UTC-4), then standard (UTC-5).
    expect(iso(zonedToInstant("2027-11-07", "01:30", "America/Toronto"))).toBe("2027-11-07T05:30:00.000Z");
  });

  test("handles zones with half-hour offsets", () => {
    expect(iso(zonedToInstant("2027-03-20", "09:00", "Asia/Kolkata"))).toBe("2027-03-20T03:30:00.000Z");
  });
});

describe("instantToZoned", () => {
  test("shows an instant as a date and clock time in a zone", () => {
    const instant = new Date("2027-03-17T16:00:00Z");
    expect(instantToZoned(instant, "America/Toronto")).toEqual({ date: "2027-03-17", time: "12:00" });
    expect(instantToZoned(instant, "Asia/Tokyo")).toEqual({ date: "2027-03-18", time: "01:00" });
  });
});

describe("isValidTimeZone", () => {
  test("accepts IANA zone names and rejects anything else", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
