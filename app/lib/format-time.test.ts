import { describe, expect, test } from "vitest";

import { dayHeading, dayKey, fullTimeRange, timeRange, zoneAbbreviation } from "./format-time";

const start = new Date("2027-03-17T16:00:00Z");
const end = new Date("2027-03-17T17:30:00Z");

describe("session times for a viewer", () => {
  test("put a session on the viewer's own calendar day", () => {
    expect(dayKey(start, "America/Toronto")).toBe("2027-03-17");
    expect(dayKey(new Date("2027-03-17T23:30:00Z"), "Asia/Tokyo")).toBe("2027-03-18");
    expect(dayHeading("2027-03-17")).toBe("Wednesday, March 17");
  });

  test("show the range in the viewer's zone", () => {
    expect(timeRange(start, end, "America/Toronto")).toMatch(/^12:00\s*–\s*1:30\sPM$/);
    expect(timeRange(start, end, "Europe/London")).toMatch(/^4:00\s*–\s*5:30\sPM$/);
  });

  test("name the end's day when a session runs past the viewer's midnight", () => {
    const late = timeRange(new Date("2027-03-18T03:30:00Z"), new Date("2027-03-18T05:00:00Z"), "America/Toronto");
    expect(late).toContain("Wed");
    expect(late).toContain("Thu");
  });

  test("give the full date and zone for a session's page", () => {
    expect(fullTimeRange(start, end, "America/Toronto")).toMatch(/Wednesday, March 17.*12:00.*1:30\sPM EDT/);
  });

  test("name the zone as it is at that moment", () => {
    expect(zoneAbbreviation("America/Toronto", new Date("2027-03-10T12:00:00Z"))).toBe("EST");
    expect(zoneAbbreviation("America/Toronto", start)).toBe("EDT");
  });
});
