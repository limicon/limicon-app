import { describe, expect, test } from "vitest";

import { checkSessionForm, readSessionForm, sessionToFormInput, type SessionFormInput } from "./session-form";

const complete: SessionFormInput = {
  title: "Thresholds and transitions",
  description: "We talk about the in-between.",
  intention: "",
  theme: "Personal Growth and Inner Work",
  sessionTypes: ["dialog"],
  experience: ["ok_to_listen"],
  date: "2027-03-17",
  start: "12:00",
  lengthMinutes: "90",
  timeZone: "America/Toronto",
  meetingLink: "https://zoom.us/j/123",
  city: "",
  venueNote: "",
  maxParticipants: "",
  waitlist: false,
  recorded: "yes",
  recordingAudience: "members",
  aiAllowed: "no",
  aiPermissions: [],
};

const draft = (input: Partial<SessionFormInput>) =>
  checkSessionForm({ ...emptyForm(), ...input }, { publish: false });

function emptyForm(): SessionFormInput {
  return {
    title: "", description: "", intention: "", theme: "", sessionTypes: [], experience: [],
    date: "", start: "", lengthMinutes: "", timeZone: "America/Toronto", meetingLink: "",
    city: "", venueNote: "", maxParticipants: "", waitlist: false, recorded: "",
    recordingAudience: "", aiAllowed: "", aiPermissions: [],
  };
}

describe("checkSessionForm", () => {
  test("publishes a complete session, ending after its length", () => {
    const result = checkSessionForm(complete, { publish: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.startsAt?.toISOString()).toBe("2027-03-17T16:00:00.000Z");
    expect(result.values.endsAt?.toISOString()).toBe("2027-03-17T17:30:00.000Z");
    expect(result.values.privacy).toBe("members");
  });

  test("saves a draft with only a title", () => {
    const result = draft({ title: "An idea" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.startsAt).toBeNull();
  });

  test("always needs a title, of at most 60 characters", () => {
    expect(draft({})).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    expect(draft({ title: "x".repeat(61) })).toMatchObject({ ok: false, errors: { title: expect.stringContaining("60") } });
    expect(draft({ title: "x".repeat(60) }).ok).toBe(true);
  });

  test("needs a theme, a session type, a time and a recording answer to publish", () => {
    const result = checkSessionForm({ ...emptyForm(), title: "An idea" }, { publish: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["date", "lengthMinutes", "recorded", "sessionTypes", "start", "theme"]);
  });

  test("saves a draft with the form's default length but no date or start", () => {
    const result = draft({ title: "An idea", lengthMinutes: "60" });
    expect(result.ok && result.values.startsAt).toBeNull();
  });

  test("asks for the date, start and length together, even in a draft", () => {
    const result = draft({ title: "An idea", date: "2027-03-17" });
    expect(result).toMatchObject({ ok: false, errors: { start: expect.any(String), lengthMinutes: expect.any(String) } });
  });

  test("keeps sessions between 15 minutes and 12 hours", () => {
    expect(checkSessionForm({ ...complete, lengthMinutes: "10" }, { publish: true }).ok).toBe(false);
    expect(checkSessionForm({ ...complete, lengthMinutes: "721" }, { publish: true }).ok).toBe(false);
    expect(checkSessionForm({ ...complete, lengthMinutes: "15" }, { publish: true }).ok).toBe(true);
  });

  test("lets a session run past midnight", () => {
    const result = checkSessionForm({ ...complete, start: "23:30", lengthMinutes: "60" }, { publish: true });
    expect(result.ok && result.values.endsAt?.toISOString()).toBe("2027-03-18T04:30:00.000Z");
  });

  test("rejects a start time the clock change skips", () => {
    const result = checkSessionForm({ ...complete, date: "2027-03-14", start: "02:30" }, { publish: true });
    expect(result).toMatchObject({ ok: false, errors: { start: expect.stringContaining("clocks change") } });
  });

  test("keeps the date within the event, when its dates are set", () => {
    const window = { first: "2027-03-08", last: "2027-04-04" };
    expect(checkSessionForm({ ...complete, date: "2027-03-07" }, { publish: true, eventWindow: window }).ok).toBe(false);
    expect(checkSessionForm(complete, { publish: true, eventWindow: window }).ok).toBe(true);
  });

  test("rejects a meeting link that isn't a web address, and warns about http", () => {
    expect(checkSessionForm({ ...complete, meetingLink: "zoom meeting 123" }, { publish: true }).ok).toBe(false);
    const insecure = checkSessionForm({ ...complete, meetingLink: "http://example.org/room" }, { publish: true });
    expect(insecure.ok && insecure.warnings).toHaveLength(1);
  });

  test("uses a city and venue instead of a meeting link for in-person sessions", () => {
    const result = checkSessionForm(
      { ...complete, sessionTypes: ["in_person", "connecting"], city: "Toronto", venueNote: "Room 2", meetingLink: "not used" },
      { publish: true },
    );
    expect(result.ok && result.values).toMatchObject({ meetingLink: null, city: "Toronto", venueNote: "Room 2" });
  });

  test("stores no recording as private, and needs an audience for a recording", () => {
    const notRecorded = checkSessionForm({ ...complete, recorded: "no" }, { publish: true });
    expect(notRecorded.ok && notRecorded.values.privacy).toBe("private");
    expect(checkSessionForm({ ...complete, recordingAudience: "" }, { publish: true }).ok).toBe(false);
  });

  test("keeps a waitlist only when there's a capacity", () => {
    const noLimit = checkSessionForm({ ...complete, waitlist: true }, { publish: true });
    expect(noLimit.ok && noLimit.values.waitlistEnabled).toBe(false);
    const limited = checkSessionForm({ ...complete, waitlist: true, maxParticipants: "20" }, { publish: true });
    expect(limited.ok && limited.values).toMatchObject({ maxParticipants: 20, waitlistEnabled: true });
  });

  test("keeps AI permissions only when the assistant may attend", () => {
    const declined = checkSessionForm({ ...complete, aiAllowed: "no", aiPermissions: ["recording"] }, { publish: true });
    expect(declined.ok && declined.values.aiPermissions).toEqual([]);
    expect(checkSessionForm({ ...complete, aiAllowed: "yes" }, { publish: true }).ok).toBe(false);
  });

  test("rejects options that aren't on the form", () => {
    expect(checkSessionForm({ ...complete, sessionTypes: ["karaoke"] }, { publish: true }).ok).toBe(false);
    expect(checkSessionForm({ ...complete, theme: "Anything" }, { publish: true }).ok).toBe(false);
    expect(checkSessionForm({ ...complete, timeZone: "Nowhere/Else" }, { publish: true }).ok).toBe(false);
  });
});

describe("readSessionForm and sessionToFormInput", () => {
  test("a saved session fills the form back in, in the host's time zone", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(complete)) {
      if (Array.isArray(value)) value.forEach((v) => form.append(key, v));
      else if (typeof value === "boolean") { if (value) form.append(key, "on"); }
      else form.append(key, value);
    }
    const input = readSessionForm(form);
    expect(input).toEqual(complete);

    const result = checkSessionForm(input, { publish: true });
    if (!result.ok) throw new Error("expected a valid form");
    const description = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "We talk about the in-between." }] }] });
    expect(sessionToFormInput(result.values)).toEqual({ ...complete, description, meetingLink: "https://zoom.us/j/123" });
  });
});

describe("the formatted description", () => {
  const bulleted = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Bring", marks: [{ type: "bold" }] }, { type: "text", text: " a notebook." }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Pens" }] }] }] },
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
    ],
  };

  test("keeps the editor's formatting, drops unsafe links, and saves plain text for search", () => {
    const result = draft({ title: "An idea", description: JSON.stringify(bulleted) });
    if (!result.ok) throw new Error("expected a valid form");
    expect(result.values.description).toBe("Bring a notebook.\n• Pens\nx");
    expect(result.values.descriptionDoc?.content[0]).toEqual(bulleted.content[0]);
    expect(JSON.stringify(result.values.descriptionDoc)).not.toContain("javascript");
  });

  test("reads plain text as a paragraph a line, and an empty editor as no description", () => {
    const plain = draft({ title: "An idea", description: "One\nTwo" });
    if (!plain.ok) throw new Error("expected a valid form");
    expect(plain.values.descriptionDoc?.content).toHaveLength(2);
    const empty = draft({ title: "An idea", description: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }) });
    if (!empty.ok) throw new Error("expected a valid form");
    expect(empty.values).toMatchObject({ description: null, descriptionDoc: null });
  });

  test("limits its length", () => {
    expect(draft({ title: "An idea", description: "x".repeat(10_001) })).toMatchObject({ ok: false, errors: { description: expect.any(String) } });
  });
});
