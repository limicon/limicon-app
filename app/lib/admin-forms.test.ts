import { describe, expect, test } from "vitest";

import {
  checkEmailField,
  checkEventForm,
  checkFaqForm,
  checkLinksForm,
  checkTierForm,
  csvCell,
  dollarsToCents,
  formatDollars,
  readSwitchesForm,
  toCsv,
} from "./admin-forms";

const form = (entries: Record<string, string>) => new Map(Object.entries(entries));

test("readSwitchesForm reads ticked boxes as on", () => {
  expect(readSwitchesForm(form({ registrationOpen: "on" }))).toEqual({ registrationOpen: true, calendarOpen: false });
});

describe("checkEventForm", () => {
  const helpers = {
    toInstant: (date: string, time: string, zone: string) =>
      zone === "Skip/Zone" ? ("nonexistent" as const) : new Date(`${date}T${time}:00Z`),
    isZone: (zone: string) => zone === "UTC" || zone === "Skip/Zone",
    isImageKey: (key: string) => key === "ok.png",
    cleanAbout: (value: unknown) => (value ? { doc: value } : null),
  };
  const filled = {
    name: " Limicon 2027 ",
    teaser: "A month of open space",
    startDate: "2027-03-07",
    startTime: "12:00",
    startTimeZone: "UTC",
    endDate: "2027-04-03",
    endTime: "18:00",
    endTimeZone: "UTC",
    imageKey: "ok.png",
    about: "x",
  };

  test("reads a name, teaser, zoned start and end, image and About", () => {
    expect(checkEventForm(form(filled), helpers)).toEqual({
      ok: true,
      values: {
        name: "Limicon 2027",
        teaser: "A month of open space",
        startsAt: new Date("2027-03-07T12:00:00Z"),
        endsAt: new Date("2027-04-03T18:00:00Z"),
        startTimeZone: "UTC",
        endTimeZone: "UTC",
        imageKey: "ok.png",
        about: { doc: "x" },
      },
    });
  });

  test("a blank start or end is left unset", () => {
    const result = checkEventForm(form({ name: "Limicon" }), helpers);
    expect(result).toMatchObject({ ok: true, values: { startsAt: null, endsAt: null, startTimeZone: null, imageKey: null, about: null } });
  });

  test("needs a name, a whole date-time-zone, and an end after the start", () => {
    expect(checkEventForm(form({ ...filled, name: "" }), helpers)).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(checkEventForm(form({ ...filled, startTime: "" }), helpers)).toMatchObject({ ok: false, errors: { startTime: expect.any(String) } });
    expect(checkEventForm(form({ ...filled, endTimeZone: "Mars/Base" }), helpers)).toMatchObject({ ok: false, errors: { endTimeZone: expect.any(String) } });
    expect(checkEventForm(form({ ...filled, endDate: "2027-03-01" }), helpers)).toMatchObject({ ok: false, errors: { endDate: expect.any(String) } });
    expect(checkEventForm(form({ ...filled, startTimeZone: "Skip/Zone" }), helpers)).toMatchObject({ ok: false, errors: { startTime: expect.any(String) } });
    expect(checkEventForm(form({ ...filled, imageKey: "../evil" }), helpers)).toMatchObject({ ok: false, errors: { imageKey: expect.any(String) } });
  });
});

/** A form with repeated fields, as the member links form posts them. */
function rows(pairs: [string, string][]) {
  return {
    getAll: (name: string) => pairs.map(([label, url]) => (name === "label" ? label : url)),
  };
}

describe("checkLinksForm", () => {
  test("keeps rows in order, trimmed, and drops wholly blank ones", () => {
    expect(checkLinksForm(rows([[" Miro ", "https://miro.com/x"], ["", " "], ["Castalia", "https://castalia.app"]]))).toEqual({
      ok: true,
      links: [
        { label: "Miro", url: "https://miro.com/x" },
        { label: "Castalia", url: "https://castalia.app" },
      ],
    });
  });

  test("marks half-filled rows and links that aren't https", () => {
    const result = checkLinksForm(rows([["Miro", "miro.com"], ["", "https://x.org"]]));
    expect(result).toMatchObject({ ok: false, errors: { 0: { url: expect.any(String) }, 1: { label: expect.any(String) } } });
  });

  test("no rows clears the links", () => {
    expect(checkLinksForm(rows([]))).toEqual({ ok: true, links: [] });
  });
});

describe("checkFaqForm", () => {
  test("needs a question and an answer", () => {
    expect(checkFaqForm(form({ question: " ", answer: "" }))).toMatchObject({
      ok: false,
      errors: { question: expect.any(String), answer: expect.any(String) },
    });
  });

  test("keeps them, and whether to publish", () => {
    expect(checkFaqForm(form({ question: " When is it? ", answer: "March.", published: "on" }))).toEqual({
      ok: true,
      values: { question: "When is it?", answer: "March.", published: true },
    });
  });
});

describe("dollarsToCents", () => {
  test.each([
    ["25", 2500],
    ["$25", 2500],
    ["25.5", 2550],
    ["25.05", 2505],
    ["0", 0],
  ])("%s is %i cents", (input, cents) => expect(dollarsToCents(input)).toBe(cents));

  test.each(["", "-5", "25.555", "twenty", "1e3"])("%s isn't an amount", (input) => expect(dollarsToCents(input)).toBeNull());
});

describe("checkTierForm", () => {
  test("reads a name, a price and an order", () => {
    expect(checkTierForm(form({ name: " Standard ", price: "50", sortOrder: "2" }))).toEqual({
      ok: true,
      values: { name: "Standard", priceCents: 5000, sortOrder: 2 },
    });
  });

  test("needs a name and a price", () => {
    expect(checkTierForm(form({ name: "", price: "lots" }))).toMatchObject({
      ok: false,
      errors: { name: expect.any(String), price: expect.any(String) },
    });
  });
});

test("checkEmailField normalises the address", () => {
  expect(checkEmailField(form({ email: " Pat@Example.ORG " }))).toEqual({ ok: true, email: "pat@example.org" });
  expect(checkEmailField(form({ email: "pat" }))).toMatchObject({ ok: false });
});

test("formatDollars drops cents only when there are none", () => {
  expect(formatDollars(2500)).toBe("$25");
  expect(formatDollars(2550)).toBe("$25.50");
});

describe("CSV", () => {
  test("quotes commas, quotes and newlines", () => {
    expect(csvCell('Pat "P", Jr')).toBe('"Pat ""P"", Jr"');
    expect(csvCell(null)).toBe("");
  });

  test("keeps spreadsheets from running a cell as a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });

  test("joins rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});
