import { describe, expect, test } from "vitest";

import { parseProfileForm, splitKeywords } from "./profile-form";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("splitKeywords", () => {
  test("splits on commas and drops blanks and repeats, keeping the first spelling", () => {
    expect(splitKeywords(["Permaculture", "deep  listening, permaculture,, #Facilitation "])).toEqual([
      "Permaculture",
      "deep listening",
      "Facilitation",
    ]);
  });
});

describe("parseProfileForm", () => {
  test("reads a full profile", () => {
    const { edit, errors } = parseProfileForm(form([
      ["firstName", " Ada "], ["lastName", "Lovelace"], ["headline", "Weaving  numbers"], ["location", ""],
      ["businessName", "Engines Ltd"], ["title", "Analyst"], ["title", ""], ["title", "Writer"],
      ["showEmail", "on"], ["allowMessages", "on"],
      ["linkPlatform", "website"], ["linkValue", "ada.example"],
      ["linkPlatform", "instagram"], ["linkValue", ""],
      ["skill", "Maths"], ["skillDraft", "poetry, maths"], ["interest", "Looms"], ["interestDraft", ""],
      ["projectKeywords", "engine, notes"], ["projectDescription", "The first program."],
      ["projectKeywords", ""], ["projectDescription", ""],
    ]));
    expect(errors).toEqual({});
    expect(edit).toEqual({
      firstName: "Ada", lastName: "Lovelace", avatarKey: null, headline: "Weaving numbers", location: null,
      businessName: "Engines Ltd", titles: ["Analyst", "Writer"], showEmail: true,
      links: [{ platform: "website", value: "ada.example" }],
      skills: ["Maths", "poetry"], interests: ["Looms"],
      projects: [{ keywords: "engine, notes", description: "The first program." }],
    });
  });

  test("marks each problem beside its field", () => {
    const { errors } = parseProfileForm(form([
      ["firstName", ""], ["avatarKey", "../secret.png"],
      ["linkPlatform", "linkedin"], ["linkValue", "https://evil.example/ada"],
      ["linkPlatform", "website"], ["linkValue", "javascript:alert(1)"],
      ["projectKeywords", ""], ["projectDescription", "No keywords"],
      ["skillDraft", "x".repeat(41)],
    ]));
    expect(Object.keys(errors).sort()).toEqual(["avatarKey", "firstName", "link-0", "link-1", "project-0", "skills"]);
  });

  test("allows at most ten links", () => {
    const entries: [string, string][] = [["firstName", "Ada"]];
    for (let i = 0; i < 11; i++) entries.push(["linkPlatform", "website"], ["linkValue", `site${i}.example`]);
    expect(parseProfileForm(form(entries)).errors.links).toBe("Add up to 10 links.");
  });
});
