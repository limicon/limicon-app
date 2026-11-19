/**
 * The registration form (REG-2): its fields, and checking what a person submitted. Pure
 * functions, so the rules are easy to test.
 *
 * The first and last name come first, always: they go on the profile, and the email is the
 * account's own. Every field after them is one admins edit in the console (registration_fields),
 * and answers are stored in registration_answers under the field's key, which never changes.
 */

export const NAME_MAX = 100;
export const SHORT_MAX = 200;
export const LONG_MAX = 2000;

export const FIELD_KINDS = [
  { value: "short", label: "Short answer", answered: true },
  { value: "long", label: "Long answer", answered: true },
  { value: "checkbox", label: "Checkbox", answered: true },
  { value: "headline", label: "Headline", answered: false },
  { value: "paragraph", label: "Paragraph text", answered: false },
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number]["value"];

export type RegistrationField = {
  key: string;
  kind: FieldKind;
  label: string;
  help: string | null;
  required: boolean;
  linkUrl: string | null;
  linkText: string | null;
};

const field = (key: string, kind: FieldKind, label: string, extra: Partial<RegistrationField> = {}): RegistrationField => ({
  key,
  kind,
  label,
  help: null,
  required: false,
  linkUrl: null,
  linkText: null,
  ...extra,
});

/** The form an edition starts with until admins change it. The first migration seeds the same. */
export const DEFAULT_FIELDS: RegistrationField[] = [
  field("address", "long", "Address", { help: "Your mailing address." }),
  field("location_heading", "headline", "Location"),
  field("location_note", "paragraph", "Where you'll mostly be during Limicon."),
  field("city", "short", "City", { required: true }),
  field("region", "short", "State or province"),
  field("country", "short", "Country", { required: true }),
  field("hopes_heading", "headline", "What you hope for"),
  field("hopes_note", "paragraph", "Answer any that speak to you. They help hosts and other members find you."),
  field("session_wish", "long", "What session would you like to participate in?"),
  field("topic_wish", "long", "What topic would you like to learn more about?"),
  field("practice_wish", "long", "What practice would you like to get better at?"),
  field("conversation_wish", "long", "What conversation would you like to be a part of?"),
  field("meet_wish", "long", "Who would you like to meet?"),
  field("feeling_wish", "long", "How would you like to feel?"),
  field("hope", "long", "What do you wish will happen?"),
  field("contribution", "long", "What can you contribute?"),
  field("heard_about", "long", "How did you hear about Limicon?"),
  field("agreements_heading", "headline", "Agreements"),
  field("agree_code_of_conduct", "checkbox", "I agree to the Limicon Code of Conduct.", { required: true, linkUrl: "/conduct", linkText: "Read the Code of Conduct" }),
  field("agree_privacy_policy", "checkbox", "I agree to the Limicon Privacy Policy.", { required: true, linkUrl: "/privacy", linkText: "Read the Privacy Policy" }),
  field("confirm_contacts", "checkbox", "I'll add team@limicon.org to my contacts so Limicon emails reach me.", { required: true }),
  field("confirm_faq", "checkbox", "I'll check the website and FAQ before emailing questions.", { required: true }),
];

export function isAnswered(kind: FieldKind) {
  return kind === "short" || kind === "long" || kind === "checkbox";
}

/** What the form posts: names, text answers as strings, and checkboxes as ticked or not. */
export type RegistrationInput = {
  firstName: string;
  lastName: string;
  answers: Record<string, string | boolean>;
};

export type RegistrationValues = {
  firstName: string;
  lastName: string;
  /** Text answers to store, by field key. Unanswered optional questions are left out. */
  answers: Record<string, string>;
  /** Checkboxes ticked, by field key. Each is stored with the time it was first ticked. */
  checked: string[];
};

/** Errors by `firstName`, `lastName` or a field's key. */
export type RegistrationErrors = Record<string, string>;

export type RegistrationResult =
  | { ok: true; values: RegistrationValues }
  | { ok: false; errors: RegistrationErrors };

export function blankRegistration(fields: RegistrationField[]): RegistrationInput {
  const answers: RegistrationInput["answers"] = {};
  for (const f of fields) if (isAnswered(f.kind)) answers[f.key] = f.kind === "checkbox" ? false : "";
  return { firstName: "", lastName: "", answers };
}

export function readRegistrationForm(form: { get(name: string): unknown }, fields: RegistrationField[]): RegistrationInput {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const answers: RegistrationInput["answers"] = {};
  for (const f of fields) {
    if (f.kind === "checkbox") answers[f.key] = form.get(f.key) === "on";
    else if (isAnswered(f.kind)) answers[f.key] = text(f.key);
  }
  return { firstName: text("firstName"), lastName: text("lastName"), answers };
}

export function checkRegistrationForm(input: RegistrationInput, fields: RegistrationField[]): RegistrationResult {
  const errors: RegistrationErrors = {};
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  if (!firstName) errors.firstName = "Enter your first name.";
  else if (firstName.length > NAME_MAX) errors.firstName = `Keep your first name under ${NAME_MAX} characters.`;
  if (!lastName) errors.lastName = "Enter your last name.";
  else if (lastName.length > NAME_MAX) errors.lastName = `Keep your last name under ${NAME_MAX} characters.`;

  const answers: RegistrationValues["answers"] = {};
  const checked: string[] = [];
  for (const f of fields) {
    if (f.kind === "checkbox") {
      if (input.answers[f.key] === true) checked.push(f.key);
      else if (f.required) errors[f.key] = "Tick this box to register.";
      continue;
    }
    if (!isAnswered(f.kind)) continue;
    const raw = input.answers[f.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    const max = f.kind === "short" ? SHORT_MAX : LONG_MAX;
    if (!value) {
      if (f.required) errors[f.key] = "Answer this question to register.";
    } else if (value.length > max) {
      errors[f.key] = `Keep this under ${max} characters.`;
    } else {
      answers[f.key] = value;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { firstName, lastName, answers, checked } };
}

// --- Editing the fields (admin console) -------------------------------------------------------

export const FIELD_LABEL_MAX = 2000;
export const FIELD_HELP_MAX = 500;
export const FIELDS_MAX = 100;

/** A field as the editor posts it. A new field has no key yet. */
export type FieldInput = {
  key: string;
  kind: string;
  label: string;
  help: string;
  required: boolean;
  linkUrl: string;
  linkText: string;
};

export type FieldErrors = Record<number, Partial<Record<keyof FieldInput, string>>>;

/**
 * The field editor's rows, in order: a hidden `key` (blank for new fields), `kind`, `label`,
 * `help`, `required` (the row's key or index when ticked), `linkUrl` and `linkText`. New fields
 * get a key made from `newKey`.
 */
export function checkFieldsForm(
  form: { getAll(name: string): unknown[] },
  newKey: (label: string, taken: Set<string>) => string,
):
  | { ok: true; fields: RegistrationField[] }
  | { ok: false; input: FieldInput[]; errors: FieldErrors; message?: string } {
  const all = (name: string) => form.getAll(name).map((v) => (typeof v === "string" ? v : ""));
  const keys = all("key");
  const kinds = all("kind");
  const labels = all("label");
  const helps = all("help");
  const linkUrls = all("linkUrl");
  const linkTexts = all("linkText");
  const required = new Set(all("required"));
  const input: FieldInput[] = kinds.map((kind, i) => ({
    key: keys[i] ?? "",
    kind,
    label: (labels[i] ?? "").trim(),
    help: (helps[i] ?? "").trim(),
    required: required.has(String(i)),
    linkUrl: (linkUrls[i] ?? "").trim(),
    linkText: (linkTexts[i] ?? "").trim(),
  }));

  const errors: FieldErrors = {};
  const taken = new Set(input.map((f) => f.key).filter(Boolean));
  const fields: RegistrationField[] = [];
  input.forEach((f, i) => {
    const e: Partial<Record<keyof FieldInput, string>> = {};
    const kind = FIELD_KINDS.find((k) => k.value === f.kind)?.value;
    if (!kind) e.kind = "Choose a kind of field.";
    if (!f.label) e.label = kind === "paragraph" ? "Write the text." : "Write the question or heading.";
    else if ([...f.label].length > FIELD_LABEL_MAX) e.label = `Keep this to ${FIELD_LABEL_MAX} characters.`;
    if ([...f.help].length > FIELD_HELP_MAX) e.help = `Keep the hint to ${FIELD_HELP_MAX} characters.`;
    if (f.linkUrl && !/^(https:\/\/\S+|\/\S*)$/.test(f.linkUrl)) e.linkUrl = "Use a full address starting with https://, or a page of this site starting with /.";
    if (f.key && !/^[a-z][a-z0-9_]{0,59}$/.test(f.key)) e.key = "This field can't be saved. Remove it and add it again.";
    if (Object.keys(e).length) {
      errors[i] = e;
      return;
    }
    let key = f.key;
    if (!key) {
      key = newKey(f.label, taken);
      taken.add(key);
    }
    const answered = isAnswered(kind!);
    fields.push({
      key,
      kind: kind!,
      label: f.label,
      help: answered && f.help ? f.help : null,
      required: answered && f.required,
      linkUrl: kind === "checkbox" && f.linkUrl ? f.linkUrl : null,
      linkText: kind === "checkbox" && f.linkUrl ? f.linkText || "Read more" : null,
    });
  });
  if (input.length > FIELDS_MAX) return { ok: false, input, errors, message: `Keep the form to ${FIELDS_MAX} fields.` };
  if (Object.keys(errors).length) return { ok: false, input, errors };
  return { ok: true, fields };
}

/** A key for a new field from its label, such as `dietary_needs`, unique among `taken`. */
export function keyFromLabel(label: string, taken: Set<string>, random: () => string = () => crypto.randomUUID().slice(0, 6)) {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "f_$1")
      .slice(0, 40) || "field";
  const start = /^[a-z]/.test(base) ? base : `f_${base}`;
  let key = start;
  while (taken.has(key)) key = `${start}_${random()}`.slice(0, 60);
  return key;
}
