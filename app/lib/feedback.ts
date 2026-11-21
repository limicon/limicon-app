/**
 * The two forms members fill in after a session ends: Session Host Feedback for its hosts and
 * co-hosts, and Session Harvest for the members registered for it. The questions are the
 * Organizing Team's Google Forms from the last edition; the app already knows each person's email
 * and session, so those questions are left out. Shared by server and page code.
 */

import { VOICE_KEY } from "~/lib/voice-notes";

export type FeedbackKind = "host" | "harvest";

export const FEEDBACK_KINDS: Record<FeedbackKind, { title: string; intro: string; empty: string }> = {
  host: {
    title: "Session Host Feedback",
    intro: "Tell the Organizing Team how each session you hosted went.",
    empty: "Once a session you host has ended, its feedback form appears here.",
  },
  harvest: {
    title: "Session Harvest",
    intro: "Share what you're taking away from each session you joined.",
    empty: "Once a session you RSVP'd to has ended, its harvest form appears here.",
  },
};

export const EXPERIENCE_OPTIONS = [
  { key: "fun", label: "Had fun" },
  { key: "nervous", label: "Felt nervous / anxious" },
  { key: "met_expectations", label: "Met my expectations" },
  { key: "missed_expectations", label: "Didn't meet my expectations" },
  { key: "to_plan", label: "Went according to my plan" },
  { key: "strayed", label: "Strayed wildly from my plan" },
  { key: "connections", label: "Made meaningful connections" },
  { key: "insights", label: "Received meaningful insights or learnings" },
] as const;

export const TENSION_OPTIONS = [
  { key: "interruptions", label: "Interruptions" },
  { key: "disrespect", label: "Disrespectful behavior" },
  { key: "unsolicited_critique", label: "Unsolicited feedback or critiques" },
  { key: "conflicts", label: "Conflicts among participants" },
] as const;

export const HOST_QUESTIONS = {
  participantCount: "How many participants attended?",
  experience: "What was the experience like?",
  howItWent: "How did it go? Share anything else about your session experience.",
  organizerFeedback: "Feedback for Limicon Organizers. Anything you would like us to know, or any suggestions for improvements with your experience?",
  hadTensions: "Did any tensions arise during your session?",
  hadTensionsHelp: "i.e. interruptions, disrespectful behavior, unsolicited feedback or critiques, conflicts among participants",
  tensions: "Please select any tensions experienced during your session.",
  tensionsDescription: "Please describe tensions experienced during your session.",
  wantsSupport: "Would you like support from the Limicon Organizing Team in addressing these tensions (whether directly or indirectly)?",
  supportYes: "Yes, please email me to discuss.",
  supportNo: "No, this is for feedback purposes only.",
} as const;

export const HARVEST_QUESTIONS = {
  takeaway: "What is one take away from this session?",
  feedBack: "What would you like to feed back into the system from this session?",
  attractedRepelled: "What is something you felt attracted towards or repelled by in this session?",
  oneWord: "If you could sum up this session in one word, what would it be?",
  voiceNote: "Prefer to talk? Leave a voice note.",
  voiceNoteHelp: "Answer any of the questions below out loud, instead of writing or as well as.",
} as const;

export type HostFeedback = {
  participantCount: number | null;
  experience: string[];
  experienceOther: string | null;
  howItWent: string | null;
  organizerFeedback: string | null;
  hadTensions: boolean;
  tensions: string[];
  tensionsOther: string | null;
  tensionsDescription: string | null;
  wantsSupport: boolean | null;
};

export type Harvest = {
  takeaway: string | null;
  feedBack: string | null;
  attractedRepelled: string | null;
  oneWord: string | null;
  voiceNoteKey: string | null;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const LONG = 10000;

function text(form: FormData, name: string, max: number): string | null {
  const value = String(form.get(name) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function picked(form: FormData, name: string, options: readonly { key: string }[]): string[] {
  const values = new Set(form.getAll(name).map(String));
  return options.filter((option) => values.has(option.key)).map((option) => option.key);
}

/** Reads and checks the host form. Tension answers count only when the host said there were some. */
export function parseHostFeedback(form: FormData): Parsed<HostFeedback> {
  const errors: Record<string, string> = {};

  const countText = String(form.get("participantCount") ?? "").trim();
  let participantCount: number | null = null;
  if (countText) {
    participantCount = Number(countText);
    if (!Number.isInteger(participantCount) || participantCount < 0 || participantCount > 100000) {
      errors.participantCount = "Enter a whole number, such as 12.";
    }
  }

  // "Other" counts only with something written beside it.
  const experienceOther = form.get("experienceOtherOn") === "on" ? text(form, "experienceOther", 500) : null;
  const experience = picked(form, "experience", EXPERIENCE_OPTIONS);
  if (experience.length === 0 && !experienceOther) errors.experience = "Choose at least one.";

  const tensionsAnswer = form.get("hadTensions");
  if (tensionsAnswer !== "yes" && tensionsAnswer !== "no") errors.hadTensions = "Choose Yes or No.";
  const hadTensions = tensionsAnswer === "yes";

  let tensions: string[] = [];
  let tensionsOther: string | null = null;
  let tensionsDescription: string | null = null;
  let wantsSupport: boolean | null = null;
  if (hadTensions) {
    tensions = picked(form, "tensions", TENSION_OPTIONS);
    tensionsOther = form.get("tensionsOtherOn") === "on" ? text(form, "tensionsOther", 500) : null;
    if (tensions.length === 0 && !tensionsOther) errors.tensions = "Choose at least one.";
    tensionsDescription = text(form, "tensionsDescription", LONG);
    const support = form.get("wantsSupport");
    if (support === "yes") wantsSupport = true;
    else if (support === "no") wantsSupport = false;
    else errors.wantsSupport = "Choose one.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      participantCount,
      experience,
      experienceOther,
      howItWent: text(form, "howItWent", LONG),
      organizerFeedback: text(form, "organizerFeedback", LONG),
      hadTensions,
      tensions,
      tensionsOther,
      tensionsDescription,
      wantsSupport,
    },
  };
}

/** Reads the harvest form. Every question is optional, as on the Google Form. */
export function parseHarvest(form: FormData): Parsed<Harvest> {
  const voiceNote = String(form.get("voiceNote") ?? "");
  if (voiceNote && !VOICE_KEY.test(voiceNote)) return { ok: false, errors: { voiceNote: "That voice note didn't upload. Record it again." } };
  return {
    ok: true,
    value: {
      takeaway: text(form, "takeaway", LONG),
      feedBack: text(form, "feedBack", LONG),
      attractedRepelled: text(form, "attractedRepelled", LONG),
      oneWord: text(form, "oneWord", 60),
      voiceNoteKey: voiceNote || null,
    },
  };
}

export function isFeedbackKind(value: string | undefined): value is FeedbackKind {
  return value === "host" || value === "harvest";
}
