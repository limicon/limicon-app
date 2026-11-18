import { describe, expect, test } from "vitest";

import { checkEditionForm, checkEmailField, checkTierForm, csvCell, dollarsToCents, formatDollars, toCsv } from "./admin-forms";

const form = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("checkEditionForm", () => {
  test("empty fields clear the settings, and unticked switches are off", () => {
    expect(checkEditionForm(form({}))).toEqual({
      ok: true,
      values: { startsOn: null, endsOn: null, registrationOpen: false, calendarOpen: false, miroUrl: null, castaliaUrl: null },
    });
  });

  test("keeps dates, switches and https links", () => {
    const result = checkEditionForm(
      form({ startsOn: "2027-03-07", endsOn: "2027-04-03", registrationOpen: "on", miroUrl: " https://miro.com/app/board/x " }),
    );
    expect(result).toMatchObject({ ok: true, values: { startsOn: "2027-03-07", registrationOpen: true, miroUrl: "https://miro.com/app/board/x" } });
  });

  test("refuses impossible dates, a last day before the first, and links that aren't https", () => {
    const result = checkEditionForm(form({ startsOn: "2027-02-30", miroUrl: "miro.com", castaliaUrl: "http://x.org" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["castaliaUrl", "miroUrl", "startsOn"]);

    const backwards = checkEditionForm(form({ startsOn: "2027-04-03", endsOn: "2027-03-07" }));
    expect(backwards).toMatchObject({ ok: false, errors: { endsOn: expect.any(String) } });
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
