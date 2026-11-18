/**
 * The registration form (REG-2): its questions, and checking what a person submitted. Pure
 * functions, so the rules are easy to test. Names go on the profile and the email is the
 * account's own; every other question is stored in registration_answers under its key.
 */

export const NAME_MAX = 100;
export const SHORT_MAX = 200;
export const LONG_MAX = 2000;

/** Questions answered in a line or a paragraph, in the order the form asks them. */
export const TEXT_QUESTIONS = [
  { key: "address", label: "Address", help: "Your mailing address.", kind: "long", required: true },
  { key: "city", label: "City", kind: "short", required: true },
  { key: "region", label: "State or province", kind: "short", required: false },
  { key: "country", label: "Country", kind: "short", required: true },
  { key: "session_wish", label: "What session would you like to participate in?", kind: "long", required: false },
  { key: "topic_wish", label: "What topic would you like to learn more about?", kind: "long", required: false },
  { key: "practice_wish", label: "What practice would you like to get better at?", kind: "long", required: false },
  { key: "conversation_wish", label: "What conversation would you like to be a part of?", kind: "long", required: false },
  { key: "meet_wish", label: "Who would you like to meet?", kind: "long", required: false },
  { key: "feeling_wish", label: "How would you like to feel?", kind: "long", required: false },
  { key: "hope", label: "What do you wish will happen?", kind: "long", required: false },
  { key: "contribution", label: "What can you contribute?", kind: "long", required: false },
  { key: "heard_about", label: "How did you hear about Limicon?", kind: "long", required: false },
] as const;

export const LOCATION_KEYS = ["city", "region", "country"] as const;
export const REFLECTION_KEYS = [
  "session_wish", "topic_wish", "practice_wish", "conversation_wish",
  "meet_wish", "feeling_wish", "hope", "contribution",
] as const;

/** Checkboxes a person must tick to register. Each is stored with the time they ticked it. */
export const AGREEMENTS = [
  { key: "agree_code_of_conduct", label: "I agree to the Limicon Code of Conduct." },
  { key: "agree_privacy_policy", label: "I agree to the Limicon Privacy Policy." },
  { key: "confirm_contacts", label: "I'll add team@limicon.org to my contacts so Limicon emails reach me." },
  { key: "confirm_faq", label: "I'll check the website and FAQ before emailing questions." },
] as const;

export type TextKey = (typeof TEXT_QUESTIONS)[number]["key"];
export type AgreementKey = (typeof AGREEMENTS)[number]["key"];

/** What the form posts: text answers as strings, agreements as ticked or not. */
export type RegistrationInput = {
  firstName: string;
  lastName: string;
} & Record<TextKey, string> &
  Record<AgreementKey, boolean>;

export type RegistrationValues = {
  firstName: string;
  lastName: string;
  /** Answers to store, by question key. Unanswered optional questions are left out. */
  answers: Partial<Record<TextKey, string>>;
  agreements: AgreementKey[];
};

export type RegistrationErrors = Partial<Record<keyof RegistrationInput, string>>;

export type RegistrationResult =
  | { ok: true; values: RegistrationValues }
  | { ok: false; errors: RegistrationErrors };

export function blankRegistration(): RegistrationInput {
  const input = { firstName: "", lastName: "" } as RegistrationInput;
  for (const q of TEXT_QUESTIONS) input[q.key] = "";
  for (const a of AGREEMENTS) input[a.key] = false;
  return input;
}

export function readRegistrationForm(form: { get(name: string): unknown }): RegistrationInput {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const input = { firstName: text("firstName"), lastName: text("lastName") } as RegistrationInput;
  for (const q of TEXT_QUESTIONS) input[q.key] = text(q.key);
  for (const a of AGREEMENTS) input[a.key] = form.get(a.key) === "on";
  return input;
}

export function checkRegistrationForm(input: RegistrationInput): RegistrationResult {
  const errors: RegistrationErrors = {};
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  if (!firstName) errors.firstName = "Enter your first name.";
  else if (firstName.length > NAME_MAX) errors.firstName = `Keep your first name under ${NAME_MAX} characters.`;
  if (!lastName) errors.lastName = "Enter your last name.";
  else if (lastName.length > NAME_MAX) errors.lastName = `Keep your last name under ${NAME_MAX} characters.`;

  const answers: RegistrationValues["answers"] = {};
  for (const q of TEXT_QUESTIONS) {
    const value = input[q.key].trim();
    const max = q.kind === "short" ? SHORT_MAX : LONG_MAX;
    if (!value) {
      if (q.required) errors[q.key] = `Enter your ${q.label.toLowerCase()}.`;
    } else if (value.length > max) {
      errors[q.key] = `Keep this under ${max} characters.`;
    } else {
      answers[q.key] = value;
    }
  }

  for (const a of AGREEMENTS) {
    if (!input[a.key]) errors[a.key] = "Tick this box to register.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { firstName, lastName, answers, agreements: AGREEMENTS.map((a) => a.key) } };
}
