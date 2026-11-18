/**
 * Reading and checking the admin console's forms. Pure functions, so the rules are easy to test;
 * the server runs them on every post.
 */
import { normalizeEmail } from "~/lib/validation";

type FormLike = { get(name: string): unknown };

/**
 * Admin permissions (AUTH-5). Only `full` exists until the Organizing Team decides which narrower
 * ones it wants (PRD open question 2); any permission opens the console, and managing the team
 * needs `full`.
 */
export const ADMIN_PERMISSIONS = [{ value: "full", label: "Full access" }] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]["value"];

export function isAdminPermission(value: unknown): value is AdminPermission {
  return ADMIN_PERMISSIONS.some((permission) => permission.value === value);
}

function text(form: FormLike, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string) {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isWebAddress(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export type EditionSettings = {
  startsOn: string | null;
  endsOn: string | null;
  registrationOpen: boolean;
  calendarOpen: boolean;
};

export type EditionInput = Record<"startsOn" | "endsOn", string> & {
  registrationOpen: boolean;
  calendarOpen: boolean;
};

export type Checked<V, I> =
  | { ok: true; values: V }
  | { ok: false; input: I; errors: Partial<Record<keyof I, string>> };

/** The edition settings form: event dates, and the registration and calendar switches. */
export function checkEditionForm(form: FormLike): Checked<EditionSettings, EditionInput> {
  const input: EditionInput = {
    startsOn: text(form, "startsOn"),
    endsOn: text(form, "endsOn"),
    registrationOpen: form.get("registrationOpen") === "on",
    calendarOpen: form.get("calendarOpen") === "on",
  };
  const errors: Partial<Record<keyof EditionInput, string>> = {};
  for (const name of ["startsOn", "endsOn"] as const) {
    if (input[name] && !isRealDate(input[name])) errors[name] = "Enter a date.";
  }
  if (!errors.startsOn && !errors.endsOn && input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    errors.endsOn = "The last day can't be before the first day.";
  }
  if (Object.keys(errors).length) return { ok: false, input, errors };
  return {
    ok: true,
    values: {
      startsOn: input.startsOn || null,
      endsOn: input.endsOn || null,
      registrationOpen: input.registrationOpen,
      calendarOpen: input.calendarOpen,
    },
  };
}

export const LINK_LABEL_MAX = 60;
export const LINKS_MAX = 20;

export type MemberLink = { label: string; url: string };
export type LinkErrors = Record<number, { label?: string; url?: string }>;

/**
 * The member links form (MEM-2): rows of `label` and `url` fields in order. A row left wholly
 * blank is dropped; a half-filled row is an error.
 */
export function checkLinksForm(form: { getAll(name: string): unknown[] }):
  | { ok: true; links: MemberLink[] }
  | { ok: false; input: MemberLink[]; errors: LinkErrors; message?: string } {
  const labels = form.getAll("label").map((v) => (typeof v === "string" ? v.trim() : ""));
  const urls = form.getAll("url").map((v) => (typeof v === "string" ? v.trim() : ""));
  const input = labels.map((label, i) => ({ label, url: urls[i] ?? "" })).filter((row) => row.label || row.url);
  const errors: LinkErrors = {};
  input.forEach((row, i) => {
    const rowErrors: { label?: string; url?: string } = {};
    if (!row.label) rowErrors.label = "Give the link a name.";
    else if ([...row.label].length > LINK_LABEL_MAX) rowErrors.label = `Keep the name to ${LINK_LABEL_MAX} characters.`;
    if (!isWebAddress(row.url)) rowErrors.url = "Enter a full web address starting with https://.";
    if (rowErrors.label || rowErrors.url) errors[i] = rowErrors;
  });
  if (input.length > LINKS_MAX) return { ok: false, input, errors, message: `Keep it to ${LINKS_MAX} links.` };
  if (Object.keys(errors).length) return { ok: false, input, errors };
  return { ok: true, links: input };
}

export const NOTE_MAX = 5000;

export const FAQ_QUESTION_MAX = 300;
export const FAQ_ANSWER_MAX = 10000;

export type FaqInput = { question: string; answer: string; published: boolean };

/** An FAQ entry: a question and its answer, both required, and whether it's on the public page. */
export function checkFaqForm(form: FormLike): Checked<FaqInput, FaqInput> {
  const input: FaqInput = { question: text(form, "question"), answer: text(form, "answer"), published: form.get("published") === "on" };
  const errors: Partial<Record<keyof FaqInput, string>> = {};
  if (!input.question) errors.question = "Write the question.";
  else if ([...input.question].length > FAQ_QUESTION_MAX) errors.question = `Keep the question to ${FAQ_QUESTION_MAX} characters.`;
  if (!input.answer) errors.answer = "Write the answer.";
  else if ([...input.answer].length > FAQ_ANSWER_MAX) errors.answer = `Keep the answer to ${FAQ_ANSWER_MAX} characters.`;
  if (Object.keys(errors).length) return { ok: false, input, errors };
  return { ok: true, values: input };
}

export const TIER_NAME_MAX = 40;

/** Dollars as typed, such as "25" or "25.50", in cents; null when it isn't an amount. */
export function dollarsToCents(value: string): number | null {
  const match = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export type TierValues = { name: string; priceCents: number; sortOrder: number };
export type TierInput = { name: string; price: string; sortOrder: string };

/** A ticket tier (REG-3): its name, its price in dollars and its place in the list. */
export function checkTierForm(form: FormLike): Checked<TierValues, TierInput> {
  const input: TierInput = { name: text(form, "name"), price: text(form, "price"), sortOrder: text(form, "sortOrder") };
  const errors: Partial<Record<keyof TierInput, string>> = {};
  if (!input.name) errors.name = "Give the tier a name.";
  else if ([...input.name].length > TIER_NAME_MAX) errors.name = `Keep the name to ${TIER_NAME_MAX} characters.`;
  const priceCents = dollarsToCents(input.price);
  if (priceCents === null) errors.price = "Enter a price in dollars, such as 25 or 25.50.";
  const sortOrder = input.sortOrder === "" ? 0 : Number(input.sortOrder);
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 1000) errors.sortOrder = "Enter a whole number.";
  if (Object.keys(errors).length) return { ok: false, input, errors };
  return { ok: true, values: { name: input.name, priceCents: priceCents!, sortOrder } };
}

/** An email address typed into an invite or comp-ticket form. */
export function checkEmailField(form: FormLike): { ok: true; email: string } | { ok: false; input: string; error: string } {
  const input = text(form, "email");
  const email = normalizeEmail(input);
  return email ? { ok: true, email } : { ok: false, input, error: "Enter an email address." };
}

/** Cents as dollars for display, such as "$25" or "$25.50". */
export function formatDollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** One CSV cell, quoted when needed, with formula-leading characters neutralised for spreadsheets. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
