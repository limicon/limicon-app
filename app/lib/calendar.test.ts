import { describe, expect, test } from "vitest";

import {
  addDays,
  addMonths,
  clockMinutes,
  defaultDate,
  hourRange,
  layoutDay,
  layoutDayCapped,
  monthGrid,
  parseDate,
  parseLayout,
  threeDays,
  viewDays,
  viewRange,
} from "./calendar";

describe("calendar dates", () => {
  test("accept only real dates and known layouts from the URL", () => {
    expect(parseDate("2027-03-17")).toBe("2027-03-17");
    expect(parseDate("2027-02-29")).toBeNull();
    expect(parseDate("2027-3-17")).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseLayout("month")).toBe("month");
    expect(parseLayout("3day")).toBe("3day");
    expect(parseLayout("week")).toBe("list");
  });

  test("step across month and year ends", () => {
    expect(addDays("2027-02-27", 3)).toBe("2027-03-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(threeDays("2027-03-30")).toEqual(["2027-03-30", "2027-03-31", "2027-04-01"]);
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-01");
    expect(addMonths("2027-01-15", -1)).toBe("2026-12-01");
  });

  test("open on the event's first day while the event is ahead, otherwise today", () => {
    expect(defaultDate("2026-11-20", "2027-03-01")).toBe("2027-03-01");
    expect(defaultDate("2027-03-10", "2027-03-01")).toBe("2027-03-10");
    expect(defaultDate("2026-11-20", null)).toBe("2026-11-20");
  });
});

describe("monthGrid", () => {
  test("fills whole weeks, Sunday first, with the months either side", () => {
    // March 2027 starts on a Monday and ends on a Wednesday.
    const weeks = monthGrid("2027-03-17");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toEqual({ date: "2027-02-28", inMonth: false });
    expect(weeks[0]![1]).toEqual({ date: "2027-03-01", inMonth: true });
    expect(weeks[4]![3]).toEqual({ date: "2027-03-31", inMonth: true });
    expect(weeks[4]![6]).toEqual({ date: "2027-04-03", inMonth: false });
    expect(weeks.flat().filter((day) => day.inMonth)).toHaveLength(31);
  });

  test("has four rows for a February that starts on Sunday and six for a long, late-starting month", () => {
    expect(monthGrid("2026-02-01")).toHaveLength(4);
    // May 2027 starts on a Saturday.
    expect(monthGrid("2027-05-01")).toHaveLength(6);
  });

  test("tells the loader which days each view covers", () => {
    expect(viewDays("3day", "2027-03-17")).toEqual({ first: "2027-03-17", last: "2027-03-19" });
    expect(viewDays("month", "2027-03-17")).toEqual({ first: "2027-02-28", last: "2027-04-03" });
  });

  test("turn a view's days into instants in the viewer's zone, across a clock change", () => {
    // Toronto moves to daylight time on 14 March 2027.
    expect(viewRange({ first: "2027-03-13", last: "2027-03-15" }, "America/Toronto")).toEqual({
      from: new Date("2027-03-13T05:00:00Z"),
      to: new Date("2027-03-16T04:00:00Z"),
    });
    // Santiago's clocks skip from midnight to 1 AM on 5 September 2027.
    expect(viewRange({ first: "2027-09-05", last: "2027-09-05" }, "America/Santiago").from).toEqual(
      new Date("2027-09-05T04:00:00Z"),
    );
  });
});

describe("layoutDay", () => {
  const block = (name: string, start: string, end: string) => ({ item: name, start: clockMinutes(start), end: clockMinutes(end) });
  const lanes = (blocks: ReturnType<typeof layoutDay<string>>) =>
    Object.fromEntries(blocks.map((b) => [b.item, `${b.lane}/${b.lanes}`]));

  test("gives a session on its own the full width", () => {
    expect(lanes(layoutDay([block("a", "09:00", "10:00"), block("b", "10:00", "11:00")]))).toEqual({ a: "0/1", b: "0/1" });
  });

  test("puts overlapping sessions side by side, reusing a lane once it's free", () => {
    const placed = layoutDay([
      block("a", "09:00", "11:00"),
      block("b", "09:30", "10:00"),
      block("c", "10:00", "10:30"),
      block("d", "13:00", "14:00"),
    ]);
    expect(lanes(placed)).toEqual({ a: "0/2", b: "1/2", c: "1/2", d: "0/1" });
  });

  test("gathers sessions beyond the lanes that fit into a +N more in the last lane", () => {
    const { blocks, overflows } = layoutDayCapped(
      [
        block("a", "11:00", "12:00"),
        block("b", "11:00", "12:00"),
        block("c", "11:00", "12:00"),
        block("d", "11:30", "13:00"),
        block("e", "15:00", "16:00"),
      ],
      3,
    );
    expect(lanes(blocks)).toEqual({ a: "0/3", b: "1/3", e: "0/1" });
    expect(overflows).toEqual([{ start: clockMinutes("11:00"), end: clockMinutes("13:00"), lane: 2, lanes: 3, items: ["c", "d"] }]);
  });

  test("draws a very short session at least half an hour tall", () => {
    const [placed] = layoutDay([block("a", "09:00", "09:10")]);
    expect(placed!.end).toBe(clockMinutes("09:30"));
  });

  test("spans the hours its sessions need, and at least nine to five", () => {
    expect(hourRange([])).toEqual({ first: 9, last: 17 });
    expect(hourRange([{ start: clockMinutes("06:30"), end: clockMinutes("20:15") }])).toEqual({ first: 6, last: 21 });
    expect(hourRange([{ start: clockMinutes("22:00"), end: 1440 }])).toEqual({ first: 9, last: 24 });
  });
});
