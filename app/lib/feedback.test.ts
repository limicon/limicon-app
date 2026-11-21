import { describe, expect, test } from "vitest";

import { parseHarvest, parseHostFeedback } from "./feedback";
import { audioExtension } from "./voice-notes";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("parseHostFeedback", () => {
  test("needs an experience and a tensions answer", () => {
    const result = parseHostFeedback(form([]));
    expect(result).toEqual({ ok: false, errors: { experience: "Choose at least one.", hadTensions: "Choose Yes or No." } });
  });

  test("keeps known options and drops tension answers when there were none", () => {
    const result = parseHostFeedback(
      form([
        ["participantCount", "12"],
        ["experience", "fun"],
        ["experience", "made-up"],
        ["hadTensions", "no"],
        ["tensions", "conflicts"],
        ["wantsSupport", "yes"],
      ]),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { participantCount: 12, experience: ["fun"], hadTensions: false, tensions: [], wantsSupport: null },
    });
  });

  test("counts Other only when ticked and written", () => {
    expect(parseHostFeedback(form([["experienceOther", "Loved it"], ["hadTensions", "no"]])).ok).toBe(false);
    expect(
      parseHostFeedback(form([["experienceOtherOn", "on"], ["experienceOther", "Loved it"], ["hadTensions", "no"]])),
    ).toMatchObject({ ok: true, value: { experience: [], experienceOther: "Loved it" } });
  });

  test("with tensions, needs which ones and whether to get support", () => {
    expect(parseHostFeedback(form([["experience", "fun"], ["hadTensions", "yes"]]))).toEqual({
      ok: false,
      errors: { tensions: "Choose at least one.", wantsSupport: "Choose one." },
    });
    expect(
      parseHostFeedback(form([["experience", "fun"], ["hadTensions", "yes"], ["tensions", "interruptions"], ["wantsSupport", "yes"]])),
    ).toMatchObject({ ok: true, value: { tensions: ["interruptions"], wantsSupport: true } });
  });

  test("refuses a participant count that isn't a whole number", () => {
    expect(parseHostFeedback(form([["participantCount", "2.5"], ["experience", "fun"], ["hadTensions", "no"]]))).toMatchObject({
      ok: false,
      errors: { participantCount: "Enter a whole number, such as 12." },
    });
  });
});

describe("parseHarvest", () => {
  test("accepts empty answers as null", () => {
    expect(parseHarvest(form([["takeaway", "  "], ["oneWord", "Alive"]]))).toEqual({
      ok: true,
      value: { takeaway: null, feedBack: null, attractedRepelled: null, oneWord: "Alive", voiceNoteKey: null },
    });
  });

  test("keeps a voice note only by its stored key", () => {
    const key = "voice/3f2a0000-0000-4000-8000-000000000000.webm";
    expect(parseHarvest(form([["voiceNote", key]]))).toMatchObject({ ok: true, value: { voiceNoteKey: key } });
    expect(parseHarvest(form([["voiceNote", "../secret.webm"]])).ok).toBe(false);
  });
});

describe("audioExtension", () => {
  test("names audio by its first bytes, and refuses anything else", () => {
    const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]).slice(0, 16);
    const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
    expect(audioExtension(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("webm");
    expect(audioExtension(bytes(0, 0, 0, 0x20, ...text("ftypM4A ")))).toBe("m4a");
    expect(audioExtension(bytes(...text("OggS")))).toBe("ogg");
    expect(audioExtension(bytes(...text("RIFF"), 0, 0, 0, 0, ...text("WAVE")))).toBe("wav");
    expect(audioExtension(bytes(...text("ID3")))).toBe("mp3");
    expect(audioExtension(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
  });
});
