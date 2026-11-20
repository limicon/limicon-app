/**
 * The Host a Session form: its options, and checking what a host submitted. Drafts need only a
 * title; publishing needs the rest of SES-6. Pure functions, so the rules are easy to test.
 */
import { cleanRichText, plainToRichText, readRichText, richTextToPlain, type RichDoc } from "~/lib/rich-text";
import { IMAGE_KEY } from "~/lib/media";
import { instantToZoned, isValidTimeZone, zonedToInstant } from "~/lib/zoned-time";

export const THEMES = [
  "Collective Sensemaking and Systems Thinking",
  "Spirituality, Ritual and Contemplative Practice",
  "Practical Tools, Skills and Resources",
  "Personal Growth and Inner Work",
  "Consciousness Exploration",
  "Play, Games and Experimentation",
  "Community, Belonging and Relational Culture",
  "Creative Expression and Storytelling",
  "Conference Meta and Co-Creation Spaces",
] as const;

export const SESSION_TYPES = [
  { value: "presentation", label: "Speaker/Presentation", help: "Participants watch a prepared presentation by one or more speakers. They may share in the chat or ask questions, but mostly watch." },
  { value: "dialog", label: "Dialog/Inquiry", help: "Participants engage around a topic the hosts present, sharing their own perspectives and hearing others'." },
  { value: "collaborating", label: "Collaborating/Building", help: "Participants work together on an activity with a shared goal." },
  { value: "meta", label: "Limicon Meta", help: "Sessions that help develop Limicon, by planning or by digesting what it has generated." },
  { value: "practice", label: "Practice/Ritual", help: "Participants are guided through an experience, spending most of the time in an activity, alone, together or in breakout rooms." },
  { value: "connecting", label: "Connecting/Relating", help: "Guided experiences for meeting and getting to know other participants." },
  { value: "fun", label: "Fun!", help: "Anything playful or mainly entertaining." },
  { value: "in_person", label: "In-Person", help: "Happens in a physical space, for Limicon attendees." },
] as const;

export const EXPERIENCE = [
  { value: "breakouts", label: "Breakouts used", help: "You'll send participants into smaller breakout rooms at some point." },
  { value: "no_late_arrivals", label: "No late arrivals", help: "Late arrivals may be turned away. Give the cutoff time in the description." },
  { value: "bots_allowed", label: "Bots allowed", help: "Participants may use their own AI note-takers." },
  { value: "ok_to_listen", label: "OK to listen", help: "Participants may attend with cameras off and without taking part." },
  { value: "kid_friendly", label: "Kid friendly", help: "Suitable for younger participants, or people with children in the room." },
] as const;

/** Who a recording is shared with, when the host records. Not recording stores "private". */
export const RECORDING_AUDIENCES = [
  { value: "participants", label: "Session participants only", help: "You share the recording only with the people who attended." },
  { value: "members", label: "Limicon members", help: "The recording is shared with this edition's members in the Members area." },
  { value: "public", label: "Public", help: "You may post the recording anywhere online." },
] as const;

/** Provisional until the AI co-creation sessions reach consensus (PRD → AI and privacy). */
export const AI_PERMISSIONS = [
  { value: "recording", label: "Recording" },
  { value: "transcription", label: "Transcription" },
  { value: "full_analysis", label: "Full analysis" },
  { value: "anonymized_analysis", label: "Anonymized analysis" },
  { value: "anonymized_themes", label: "Anonymized themes only" },
] as const;

export const TITLE_MAX = 60;
export const CO_HOSTS_MAX = 10;
/** The most extra dates one form can add, so a slip can't flood the calendar. */
export const REPEATS_MAX = 30;

/** How a new session can repeat. Each date becomes its own session. */
export const REPEATS = [
  { value: "", label: "No, just once" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "custom", label: "On other dates I choose" },
] as const;
export const DESCRIPTION_MAX = 10_000;
export const LENGTH_MIN = 15;
export const LENGTH_MAX = 12 * 60;

/** What the form posts, as plain strings; checkbox groups are arrays. */
export type SessionFormInput = {
  title: string;
  /** The description editor's document as JSON (plain text is read as one paragraph a line). */
  description: string;
  intention: string;
  /** The session photo's key in the media bucket, or "" for none. */
  imageKey: string;
  theme: string;
  sessionTypes: string[];
  experience: string[];
  date: string;
  start: string;
  lengthMinutes: string;
  timeZone: string;
  meetingLink: string;
  city: string;
  venueNote: string;
  maxParticipants: string;
  waitlist: boolean;
  recorded: string;
  recordingAudience: string;
  aiAllowed: string;
  aiPermissions: string[];
  /** Members picked as co-hosts. The names only label the tags; the server checks the ids. */
  coHosts: Person[];
  /** Repeating, for a new session: "", weekly, biweekly or custom. */
  repeat: string;
  /** The last date a weekly or two-weekly session may fall on. */
  repeatUntil: string;
  /** Custom repeats: the other dates and their start times, in the session's time zone. */
  extraDates: string[];
  extraStarts: string[];
  /** Whether every date of a repeating session shares the first one's title and description. */
  sameDetails: boolean;
  /** When they don't: each further date's title and description, in `repeatRows` order. */
  repeatTitles: string[];
  repeatDescriptions: string[];
};

/** A member as the co-host field shows them. */
export type Person = { id: string; name: string };

/** A session's columns, ready to save. */
export type SessionValues = {
  title: string;
  /** The description's plain text, for search; `descriptionDoc` is what members see. */
  description: string | null;
  descriptionDoc: RichDoc | null;
  intention: string | null;
  /** The session's photo in the media bucket; schedules fall back to the host's picture. */
  imageKey: string | null;
  theme: string | null;
  sessionTypes: string[];
  experience: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  timeZone: string;
  meetingLink: string | null;
  city: string | null;
  venueNote: string | null;
  maxParticipants: number | null;
  waitlistEnabled: boolean;
  privacy: "private" | "participants" | "members" | "public";
  aiAssistantAllowed: boolean;
  aiPermissions: string[];
  /** Co-hosts' profile ids, besides the host who created the session. */
  coHostIds: string[];
  /**
   * Further dates for a repeating session, each saved as a session of its own. A date with its own
   * title or description carries it; otherwise it takes the first session's.
   */
  repeats: RepeatDate[];
};

export type RepeatDate = {
  startsAt: Date;
  endsAt: Date;
  title?: string;
  description?: string | null;
  descriptionDoc?: RichDoc | null;
};

export type FieldErrors = Partial<Record<keyof SessionFormInput, string>>;

export type CheckResult =
  | { ok: true; values: SessionValues; warnings: string[] }
  | { ok: false; errors: FieldErrors };

/** Reads the form's fields out of submitted form data. */
export function readSessionForm(form: { get(name: string): unknown; getAll(name: string): unknown[] }): SessionFormInput {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const list = (name: string) => form.getAll(name).filter((v): v is string => typeof v === "string");
  return {
    title: text("title"),
    description: text("description"),
    intention: text("intention"),
    imageKey: text("imageKey"),
    theme: text("theme"),
    sessionTypes: list("sessionTypes"),
    experience: list("experience"),
    date: text("date"),
    start: text("start"),
    lengthMinutes: text("lengthMinutes"),
    timeZone: text("timeZone"),
    meetingLink: text("meetingLink"),
    city: text("city"),
    venueNote: text("venueNote"),
    maxParticipants: text("maxParticipants"),
    waitlist: text("waitlist") === "on",
    recorded: text("recorded"),
    recordingAudience: text("recordingAudience"),
    aiAllowed: text("aiAllowed"),
    aiPermissions: list("aiPermissions"),
    repeat: text("repeat"),
    repeatUntil: text("repeatUntil"),
    extraDates: list("extraDates").map((v) => v.trim()),
    extraStarts: list("extraStarts").map((v) => v.trim()),
    sameDetails: text("sameDetails") === "on",
    repeatTitles: list("repeatTitles").map((v) => v.trim()),
    repeatDescriptions: list("repeatDescriptions").map((v) => v.trim()),
    coHosts: list("coHosts").flatMap((value) => {
      try {
        const person = JSON.parse(value) as Partial<Person>;
        return typeof person.id === "string" ? [{ id: person.id, name: String(person.name ?? "").slice(0, 200) }] : [];
      } catch {
        return [];
      }
    }),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends { value: string }>(options: readonly T[], value: string) =>
  options.some((option) => option.value === value);

/**
 * Checks a submitted form. `publish` applies the rules for putting a session on the calendar;
 * a draft needs only a title. `eventWindow` holds the edition's first and last dates
 * ("YYYY-MM-DD"), when they're set.
 */
export function checkSessionForm(
  input: SessionFormInput,
  options: { publish: boolean; eventWindow?: { first: string | null; last: string | null } },
): CheckResult {
  const errors: FieldErrors = {};
  const warnings: string[] = [];
  const { publish } = options;

  if (input.imageKey && !IMAGE_KEY.test(input.imageKey)) errors.imageKey = "Upload the photo again.";

  if (!input.title) errors.title = "Give the session a title.";
  else if ([...input.title].length > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters.`;

  if (input.theme && !THEMES.includes(input.theme as (typeof THEMES)[number])) errors.theme = "Choose a theme from the list.";
  else if (publish && !input.theme) errors.theme = "Choose a theme to publish.";

  if (input.sessionTypes.some((type) => !oneOf(SESSION_TYPES, type))) errors.sessionTypes = "Choose session types from the list.";
  else if (publish && input.sessionTypes.length === 0) errors.sessionTypes = "Choose at least one session type to publish.";

  if (input.experience.some((flag) => !oneOf(EXPERIENCE, flag))) errors.experience = "Choose from the listed options.";

  if (!isValidTimeZone(input.timeZone)) errors.timeZone = "Choose a time zone from the list.";

  // When: date, start and length together, or (drafts only) no date or start. The form fills in a
  // length, so a length alone doesn't count as starting on the time.
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  const anyWhen = Boolean(input.date || input.start);
  if (publish || anyWhen) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = publish ? "Choose a date to publish." : "Choose a date, or clear the start time and length.";
    if (!/^\d{2}:\d{2}$/.test(input.start)) errors.start = publish ? "Choose a start time to publish." : "Choose a start time, or clear the date and length.";
    const length = Number(input.lengthMinutes);
    if (!/^\d+$/.test(input.lengthMinutes)) errors.lengthMinutes = publish ? "Give the length in minutes to publish." : "Give the length in minutes, or clear the date and start time.";
    else if (length < LENGTH_MIN || length > LENGTH_MAX) errors.lengthMinutes = `Sessions run from ${LENGTH_MIN} minutes to ${LENGTH_MAX / 60} hours.`;

    const window = options.eventWindow;
    if (!errors.date && window?.first && input.date < window.first) errors.date = "Choose a date within the event.";
    if (!errors.date && window?.last && input.date > window.last) errors.date = "Choose a date within the event.";

    if (!errors.date && !errors.start && !errors.lengthMinutes && !errors.timeZone) {
      const instant = zonedToInstant(input.date, input.start, input.timeZone);
      if (instant === "nonexistent") {
        errors.start = "That time doesn't exist on this date in this time zone, because the clocks change. Choose another time.";
      } else {
        startsAt = instant;
        endsAt = new Date(instant.getTime() + length * 60_000);
      }
    }
  }

  const repeats = checkRepeats(input, { startsAt, endsAt, eventWindow: options.eventWindow }, errors);

  // Where.
  const inPerson = input.sessionTypes.includes("in_person");
  let meetingLink: string | null = null;
  if (!inPerson && input.meetingLink) {
    let url: URL | null = null;
    try {
      url = new URL(input.meetingLink);
    } catch {
      url = null;
    }
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
      errors.meetingLink = "Enter the full meeting link, starting with https://";
    } else {
      meetingLink = url.toString();
      if (url.protocol === "http:") warnings.push("The meeting link doesn't start with https://, so it isn't secure. Check it with your meeting service.");
    }
  }

  // Capacity.
  let maxParticipants: number | null = null;
  if (input.maxParticipants) {
    if (!/^\d+$/.test(input.maxParticipants) || Number(input.maxParticipants) < 1) {
      errors.maxParticipants = "Enter a whole number, or leave it blank for no limit.";
    } else {
      maxParticipants = Number(input.maxParticipants);
    }
  }

  // Recording.
  let privacy: SessionValues["privacy"] = "members";
  if (input.recorded === "no") privacy = "private";
  else if (input.recorded === "yes") {
    if (oneOf(RECORDING_AUDIENCES, input.recordingAudience)) privacy = input.recordingAudience as SessionValues["privacy"];
    else errors.recordingAudience = "Choose who the recording is shared with.";
  } else if (publish) errors.recorded = "Say whether you'll record the session.";

  // AI assistant consent (provisional).
  const aiAllowed = input.aiAllowed === "yes";
  if (input.aiPermissions.some((permission) => !oneOf(AI_PERMISSIONS, permission))) errors.aiPermissions = "Choose from the listed permissions.";
  else if (aiAllowed && publish && input.aiPermissions.length === 0) errors.aiPermissions = "Choose what the assistant may do, or answer No.";

  // Co-hosts: members picked from the search, never typed names.
  const coHostIds = [...new Set(input.coHosts.map((person) => person.id))];
  if (coHostIds.some((id) => !UUID.test(id))) errors.coHosts = "Choose co-hosts from the list of registered members.";
  else if (coHostIds.length > CO_HOSTS_MAX) errors.coHosts = `A session can have up to ${CO_HOSTS_MAX} co-hosts.`;

  // About this session.
  const descriptionDoc = readDescription(input.description);
  const description = richTextToPlain(descriptionDoc);
  if (description.length > DESCRIPTION_MAX) errors.description = `Keep the description to ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    warnings,
    values: {
      title: input.title,
      description: description || null,
      descriptionDoc,
      intention: input.intention || null,
      imageKey: input.imageKey || null,
      theme: input.theme || null,
      sessionTypes: input.sessionTypes,
      experience: input.experience,
      startsAt,
      endsAt,
      timeZone: input.timeZone,
      meetingLink,
      city: inPerson ? input.city || null : null,
      venueNote: inPerson ? input.venueNote || null : null,
      maxParticipants,
      waitlistEnabled: maxParticipants !== null && input.waitlist,
      privacy,
      aiAssistantAllowed: aiAllowed,
      aiPermissions: aiAllowed ? input.aiPermissions : [],
      coHostIds,
      repeats,
    },
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** "YYYY-MM-DD" plus `days`. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * The further dates and start times a repeating session's form asks for, in the order the form
 * lists them: the host's own rows, or every week or two from the first date until `repeatUntil`
 * (or the event's last day). The editor shows a title and description box for each; the server
 * reads them back in this same order. Stops one past the most allowed, so callers can tell.
 */
export function repeatRows(input: Pick<SessionFormInput, "repeat" | "date" | "start" | "repeatUntil" | "extraDates" | "extraStarts">, lastDay: string | null): { date: string; start: string }[] {
  if (input.repeat === "custom") {
    return input.extraDates.map((date, i) => ({ date, start: input.extraStarts[i] ?? "" })).filter((row) => row.date || row.start);
  }
  if (input.repeat !== "weekly" && input.repeat !== "biweekly") return [];
  const until = input.repeatUntil || lastDay || "";
  if (!DATE.test(until) || !DATE.test(input.date)) return [];
  const step = input.repeat === "weekly" ? 7 : 14;
  const rows: { date: string; start: string }[] = [];
  for (let date = addDays(input.date, step); date <= until && rows.length <= REPEATS_MAX; date = addDays(date, step)) {
    rows.push({ date, start: input.start });
  }
  return rows;
}

/**
 * The further dates a repeating session falls on, at the same clock time in its time zone, so a
 * weekly noon session stays at noon across a daylight-saving change. Adds any problems to `errors`.
 */
function checkRepeats(
  input: SessionFormInput,
  first: { startsAt: Date | null; endsAt: Date | null; eventWindow?: { first: string | null; last: string | null } },
  errors: FieldErrors,
): { startsAt: Date; endsAt: Date }[] {
  if (!input.repeat) return [];
  if (!REPEATS.some((option) => option.value === input.repeat)) {
    errors.repeat = "Choose how the session repeats from the list.";
    return [];
  }
  if (!first.startsAt || !first.endsAt) {
    if (!errors.date && !errors.start && !errors.lengthMinutes) errors.repeat = "Choose the first date and start time, then how it repeats.";
    return [];
  }
  const window = first.eventWindow;
  const outside = (date: string) => Boolean((window?.first && date < window.first) || (window?.last && date > window.last));

  const dates: { date: string; start: string }[] = [];
  if (input.repeat === "custom") {
    const rows = repeatRows(input, window?.last ?? null);
    if (rows.length === 0) errors.extraDates = "Add at least one more date, or choose not to repeat.";
    else if (rows.some((row) => !DATE.test(row.date) || !TIME.test(row.start))) errors.extraDates = "Give each extra date a start time.";
    else if (rows.some((row) => outside(row.date))) errors.extraDates = "Choose dates within the event.";
    else dates.push(...rows);
  } else {
    const until = input.repeatUntil || window?.last || "";
    const step = input.repeat === "weekly" ? 7 : 14;
    if (!DATE.test(until)) errors.repeatUntil = "Choose the last date it can repeat on.";
    else if (window?.last && until > window.last) errors.repeatUntil = "Choose a date within the event.";
    else {
      dates.push(...repeatRows(input, window?.last ?? null));
      if (dates.length === 0) errors.repeatUntil = `Choose a date at least ${step === 7 ? "a week" : "two weeks"} after the first one.`;
    }
  }
  if (dates.length > REPEATS_MAX) {
    errors[input.repeat === "custom" ? "extraDates" : "repeatUntil"] = `A session can repeat up to ${REPEATS_MAX} times.`;
    return [];
  }

  const length = first.endsAt.getTime() - first.startsAt.getTime();
  const seen = new Set([first.startsAt.getTime()]);
  const repeats: RepeatDate[] = [];
  for (const [index, { date, start }] of dates.entries()) {
    const instant = zonedToInstant(date, start, input.timeZone);
    if (instant === "nonexistent") {
      errors[input.repeat === "custom" ? "extraDates" : "repeatUntil"] = `${start} doesn't exist on ${date} in this time zone, because the clocks change. Choose another time.`;
      return [];
    }
    if (seen.has(instant.getTime())) continue;
    seen.add(instant.getTime());
    repeats.push({ startsAt: instant, endsAt: new Date(instant.getTime() + length), ...ownDetails(input, index, errors) });
  }
  return repeats.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * A further date's own title and description, when the host gave them; empty boxes take the first
 * session's. Adds any problems to `errors`.
 */
function ownDetails(input: SessionFormInput, index: number, errors: FieldErrors): Partial<RepeatDate> {
  if (input.sameDetails) return {};
  const details: Partial<RepeatDate> = {};
  const title = input.repeatTitles[index] ?? "";
  if ([...title].length > TITLE_MAX) errors.repeatTitles = `Keep session ${index + 2}'s title to ${TITLE_MAX} characters.`;
  else if (title) details.title = title;
  const description = input.repeatDescriptions[index] ?? "";
  if (description.length > DESCRIPTION_MAX) errors.repeatDescriptions = `Keep session ${index + 2}'s description to ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`;
  else if (description) {
    details.descriptionDoc = cleanRichText(plainToRichText(description));
    details.description = richTextToPlain(details.descriptionDoc) || null;
  }
  return details;
}

/** Fills the form from a saved session, showing its times in the zone the host chose. */
export function sessionToFormInput(session: Omit<SessionValues, "repeats"> & { coHosts?: Person[] }): SessionFormInput {
  const start = session.startsAt ? instantToZoned(session.startsAt, session.timeZone) : null;
  const length =
    session.startsAt && session.endsAt
      ? String(Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000))
      : "";
  return {
    title: session.title,
    description: JSON.stringify(session.descriptionDoc ?? plainToRichText(session.description ?? "")),
    intention: session.intention ?? "",
    imageKey: session.imageKey ?? "",
    theme: session.theme ?? "",
    sessionTypes: session.sessionTypes,
    experience: session.experience,
    date: start?.date ?? "",
    start: start?.time ?? "",
    lengthMinutes: length,
    timeZone: session.timeZone,
    meetingLink: session.meetingLink ?? "",
    city: session.city ?? "",
    venueNote: session.venueNote ?? "",
    maxParticipants: session.maxParticipants === null ? "" : String(session.maxParticipants),
    waitlist: session.waitlistEnabled,
    recorded: session.privacy === "private" ? "no" : "yes",
    recordingAudience: session.privacy === "private" ? "" : session.privacy,
    aiAllowed: session.aiAssistantAllowed ? "yes" : "no",
    aiPermissions: session.aiPermissions,
    coHosts: session.coHosts ?? [],
    repeat: "",
    repeatUntil: "",
    extraDates: [],
    extraStarts: [],
    sameDetails: true,
    repeatTitles: [],
    repeatDescriptions: [],
  };
}

/** The description as a cleaned document: the editor posts JSON; anything else is plain text. */
function readDescription(value: string): RichDoc | null {
  if (!value) return null;
  if (value.startsWith("{")) return readRichText(value);
  return cleanRichText(plainToRichText(value));
}
