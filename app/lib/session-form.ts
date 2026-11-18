/**
 * The Host a Session form: its options, and checking what a host submitted. Drafts need only a
 * title; publishing needs the rest of SES-6. Pure functions, so the rules are easy to test.
 */
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
export const LENGTH_MIN = 15;
export const LENGTH_MAX = 12 * 60;

/** What the form posts, as plain strings; checkbox groups are arrays. */
export type SessionFormInput = {
  title: string;
  description: string;
  intention: string;
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
};

/** A session's columns, ready to save. */
export type SessionValues = {
  title: string;
  description: string | null;
  intention: string | null;
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
  };
}

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

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    warnings,
    values: {
      title: input.title,
      description: input.description || null,
      intention: input.intention || null,
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
    },
  };
}

/** Fills the form from a saved session, showing its times in the zone the host chose. */
export function sessionToFormInput(session: SessionValues): SessionFormInput {
  const start = session.startsAt ? instantToZoned(session.startsAt, session.timeZone) : null;
  const length =
    session.startsAt && session.endsAt
      ? String(Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000))
      : "";
  return {
    title: session.title,
    description: session.description ?? "",
    intention: session.intention ?? "",
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
  };
}
