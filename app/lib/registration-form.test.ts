import { describe, expect, test } from "vitest";

import {
  blankRegistration,
  checkFieldsForm,
  checkRegistrationForm,
  DEFAULT_FIELDS,
  keyFromLabel,
  readRegistrationForm,
  type RegistrationInput,
} from "./registration-form";

const fields = DEFAULT_FIELDS;
const checkboxes = fields.filter((f) => f.kind === "checkbox").map((f) => f.key);

function complete(answers: Record<string, string | boolean> = {}, names: Partial<RegistrationInput> = {}): RegistrationInput {
  const input = blankRegistration(fields);
  Object.assign(input.answers, { address: "1 Main St", city: "Toronto", country: "Canada" });
  for (const key of checkboxes) input.answers[key] = true;
  Object.assign(input.answers, answers);
  return { ...input, firstName: " Ada ", lastName: "Lovelace", ...names };
}

describe("checkRegistrationForm", () => {
  test("accepts the required answers, trimmed, and leaves blank optional ones out", () => {
    expect(checkRegistrationForm(complete({ meet_wish: "  Other gardeners " }), fields)).toEqual({
      ok: true,
      values: {
        firstName: "Ada",
        lastName: "Lovelace",
        answers: { address: "1 Main St", city: "Toronto", country: "Canada", meet_wish: "Other gardeners" },
        checked: checkboxes,
      },
    });
  });

  test("asks for name and location, but not address", () => {
    const result = checkRegistrationForm(complete({ address: "", city: "", country: "" }, { firstName: "", lastName: " " }), fields);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["city", "country", "firstName", "lastName"]);
  });

  test("needs every required checkbox ticked", () => {
    expect(checkRegistrationForm(complete({ agree_privacy_policy: false, confirm_faq: false }), fields)).toEqual({
      ok: false,
      errors: { agree_privacy_policy: "Tick this box to register.", confirm_faq: "Tick this box to register." },
    });
  });

  test("an optional checkbox can stay unticked", () => {
    const withOptional = [...fields, { key: "newsletter", kind: "checkbox" as const, label: "Newsletter", help: null, required: false, linkUrl: null, linkText: null }];
    const result = checkRegistrationForm({ ...complete(), answers: { ...complete().answers, newsletter: false } }, withOptional);
    expect(result).toMatchObject({ ok: true, values: { checked: checkboxes } });
  });

  test("limits answer lengths", () => {
    const result = checkRegistrationForm(complete({ city: "x".repeat(201), hope: "y".repeat(2001) }), fields);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["city", "hope"]);
  });
});

test("readRegistrationForm reads ticked boxes as true, missing fields as blank, and skips headlines", () => {
  const form = new FormData();
  form.set("firstName", "Ada");
  form.set("agree_code_of_conduct", "on");
  form.set("location_heading", "ignored");
  const input = readRegistrationForm(form, fields);
  expect(input.firstName).toBe("Ada");
  expect(input.answers.city).toBe("");
  expect(input.answers.agree_code_of_conduct).toBe(true);
  expect(input.answers.agree_privacy_policy).toBe(false);
  expect(input.answers).not.toHaveProperty("location_heading");
});

/** The field editor's rows, as its repeated inputs post them. */
function rows(list: { key?: string; kind: string; label: string; help?: string; required?: boolean; linkUrl?: string; linkText?: string }[]) {
  const values: Record<string, string[]> = { key: [], kind: [], label: [], help: [], required: [], linkUrl: [], linkText: [] };
  list.forEach((r, i) => {
    values.key!.push(r.key ?? "");
    values.kind!.push(r.kind);
    values.label!.push(r.label);
    values.help!.push(r.help ?? "");
    values.linkUrl!.push(r.linkUrl ?? "");
    values.linkText!.push(r.linkText ?? "");
    if (r.required) values.required!.push(String(i));
  });
  return { getAll: (name: string) => values[name] ?? [] };
}

describe("checkFieldsForm", () => {
  const newKey = (label: string, taken: Set<string>) => keyFromLabel(label, taken, () => "abc123");

  test("keeps existing keys, makes keys for new fields, and drops what a kind doesn't use", () => {
    const result = checkFieldsForm(
      rows([
        { key: "city", kind: "short", label: "City", required: true },
        { kind: "headline", label: "Food", required: true, help: "ignored" },
        { kind: "checkbox", label: "I'm vegetarian", linkUrl: "https://example.org/menu" },
        { kind: "paragraph", label: "Meals are shared." },
      ]),
      newKey,
    );
    expect(result).toEqual({
      ok: true,
      fields: [
        { key: "city", kind: "short", label: "City", help: null, required: true, linkUrl: null, linkText: null },
        { key: "food", kind: "headline", label: "Food", help: null, required: false, linkUrl: null, linkText: null },
        { key: "i_m_vegetarian", kind: "checkbox", label: "I'm vegetarian", help: null, required: false, linkUrl: "https://example.org/menu", linkText: "Read more" },
        { key: "meals_are_shared", kind: "paragraph", label: "Meals are shared.", help: null, required: false, linkUrl: null, linkText: null },
      ],
    });
  });

  test("marks rows with no text, an unknown kind or an unsafe link", () => {
    const result = checkFieldsForm(
      rows([
        { kind: "short", label: "" },
        { kind: "video", label: "Clip" },
        { kind: "checkbox", label: "Agree", linkUrl: "javascript:alert(1)" },
      ]),
      newKey,
    );
    expect(result).toMatchObject({ ok: false, errors: { 0: { label: expect.any(String) }, 1: { kind: expect.any(String) }, 2: { linkUrl: expect.any(String) } } });
  });
});

test("keyFromLabel makes a unique, safe key", () => {
  expect(keyFromLabel("Dietary needs?", new Set())).toBe("dietary_needs");
  expect(keyFromLabel("Dietary needs?", new Set(["dietary_needs"]), () => "x1")).toBe("dietary_needs_x1");
  expect(keyFromLabel("2027 plans", new Set())).toBe("f_2027_plans");
  expect(keyFromLabel("!!!", new Set())).toBe("field");
});
