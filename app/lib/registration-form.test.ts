import { describe, expect, test } from "vitest";

import {
  AGREEMENTS,
  blankRegistration,
  checkRegistrationForm,
  readRegistrationForm,
  REFLECTION_KEYS,
  type RegistrationInput,
} from "./registration-form";

function complete(overrides: Partial<RegistrationInput> = {}): RegistrationInput {
  const input = blankRegistration();
  Object.assign(input, {
    firstName: " Ada ", lastName: "Lovelace", address: "1 Main St", city: "Toronto", country: "Canada",
  });
  for (const a of AGREEMENTS) input[a.key] = true;
  return { ...input, ...overrides };
}

describe("checkRegistrationForm", () => {
  test("accepts the required answers, trimmed, and leaves blank optional ones out", () => {
    const result = checkRegistrationForm(complete({ meet_wish: "  Other gardeners " }));
    expect(result).toEqual({
      ok: true,
      values: {
        firstName: "Ada",
        lastName: "Lovelace",
        answers: { address: "1 Main St", city: "Toronto", country: "Canada", meet_wish: "Other gardeners" },
        agreements: AGREEMENTS.map((a) => a.key),
      },
    });
  });

  test("asks for name and location, but not address", () => {
    const result = checkRegistrationForm(complete({ firstName: "", lastName: " ", address: "", city: "", country: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["city", "country", "firstName", "lastName"]);
  });

  test("lets every reflection question go unanswered", () => {
    const result = checkRegistrationForm(complete());
    expect(result.ok).toBe(true);
    if (result.ok) for (const key of REFLECTION_KEYS) expect(result.values.answers[key]).toBeUndefined();
  });

  test("needs every agreement ticked", () => {
    const result = checkRegistrationForm(complete({ agree_privacy_policy: false, confirm_faq: false }));
    expect(result).toEqual({
      ok: false,
      errors: { agree_privacy_policy: "Tick this box to register.", confirm_faq: "Tick this box to register." },
    });
  });

  test("limits answer lengths", () => {
    const result = checkRegistrationForm(complete({ city: "x".repeat(201), hope: "y".repeat(2001) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["city", "hope"]);
  });
});

test("readRegistrationForm reads ticked boxes as true and missing fields as blank", () => {
  const form = new FormData();
  form.set("firstName", "Ada");
  form.set("agree_code_of_conduct", "on");
  const input = readRegistrationForm(form);
  expect(input.firstName).toBe("Ada");
  expect(input.city).toBe("");
  expect(input.agree_code_of_conduct).toBe(true);
  expect(input.agree_privacy_policy).toBe(false);
});
