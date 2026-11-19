/**
 * Reading and checking the admin console's forms. Pure functions, so the rules are easy to test;
 * the server runs them on every post.
 */
import { normalizeEmail } from "~/lib/validation";

type FormLike = { get(name: string): unknown };

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
  registrationOpen: boolean;
  calendarOpen: boolean;
};

export type Checked<V, I> =
  | { ok: true; values: V }
  | { ok: false; input: I; errors: Partial<Record<keyof I, string>> };

/** The registration and calendar switches (REG-10, CAL-9). An unticked box is off. */
export function readSwitchesForm(form: FormLike): EditionSettings {
  return { registrationOpen: form.get("registrationOpen") === "on", calendarOpen: form.get("calendarOpen") === "on" };
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

export const EVENT_NAME_MAX = 120;
export const TEASER_MAX = 300;

export type EventInput = {
  name: string;
  teaser: string;
  startDate: string;
  startTime: string;
  startTimeZone: string;
  endDate: string;
  endTime: string;
  endTimeZone: string;
  imageKey: string;
  about: string;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The event form. Start and end are each a date, a time and a zone; either may be left wholly
 * blank, but a half-filled one, or an end before the start, is an error. `toInstant` converts a
 * zoned date and time (zonedToInstant), and `cleanAbout` the posted About document.
 */
export function checkEventForm<Doc>(
  form: FormLike,
  helpers: {
    toInstant: (date: string, time: string, zone: string) => Date | "nonexistent";
    isZone: (zone: string) => boolean;
    isImageKey: (key: string) => boolean;
    cleanAbout: (value: unknown) => Doc | null;
  },
):
  | { ok: true; values: { name: string | null; teaser: string | null; startsAt: Date | null; endsAt: Date | null; startTimeZone: string | null; endTimeZone: string | null; imageKey: string | null; about: Doc | null } }
  | { ok: false; input: EventInput; errors: Partial<Record<keyof EventInput, string>> } {
  const input: EventInput = {
    name: text(form, "name"),
    teaser: text(form, "teaser"),
    startDate: text(form, "startDate"),
    startTime: text(form, "startTime"),
    startTimeZone: text(form, "startTimeZone"),
    endDate: text(form, "endDate"),
    endTime: text(form, "endTime"),
    endTimeZone: text(form, "endTimeZone"),
    imageKey: text(form, "imageKey"),
    about: typeof form.get("about") === "string" ? (form.get("about") as string) : "",
  };
  const errors: Partial<Record<keyof EventInput, string>> = {};
  if (!input.name) errors.name = "Give the event a name.";
  else if ([...input.name].length > EVENT_NAME_MAX) errors.name = `Keep the name to ${EVENT_NAME_MAX} characters.`;
  if ([...input.teaser].length > TEASER_MAX) errors.teaser = `Keep the teaser to ${TEASER_MAX} characters.`;

  const when = (which: "start" | "end") => {
    const date = input[`${which}Date`];
    const time = input[`${which}Time`];
    const zone = input[`${which}TimeZone`];
    if (!date && !time) return null;
    if (!isRealDate(date)) {
      errors[`${which}Date`] = "Enter a date.";
      return null;
    }
    if (!TIME.test(time)) {
      errors[`${which}Time`] = "Enter a time.";
      return null;
    }
    if (!helpers.isZone(zone)) {
      errors[`${which}TimeZone`] = "Choose a time zone.";
      return null;
    }
    const instant = helpers.toInstant(date, time, zone);
    if (instant === "nonexistent") {
      errors[`${which}Time`] = "That time doesn't exist in this zone: the clocks skip it. Choose another.";
      return null;
    }
    return instant;
  };
  const startsAt = when("start");
  const endsAt = when("end");
  if (startsAt && endsAt && endsAt <= startsAt) errors.endDate = "The end must be after the start.";
  if (input.imageKey && !helpers.isImageKey(input.imageKey)) errors.imageKey = "Upload the image again.";

  if (Object.keys(errors).length) return { ok: false, input, errors };
  return {
    ok: true,
    values: {
      name: input.name,
      teaser: input.teaser || null,
      startsAt,
      endsAt,
      startTimeZone: startsAt ? input.startTimeZone : null,
      endTimeZone: endsAt ? input.endTimeZone : null,
      imageKey: input.imageKey || null,
      about: helpers.cleanAbout(input.about),
    },
  };
}

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
