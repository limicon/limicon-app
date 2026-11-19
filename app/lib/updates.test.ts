import { describe, expect, test } from "vitest";

import { plainToRichText } from "./rich-text";
import { checkComment, checkPostForm, COMMENT_MAX } from "./updates";

const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("checkPostForm", () => {
  test("accepts a title and body, and a known template", () => {
    const body = JSON.stringify(plainToRichText("Hello"));
    expect(checkPostForm(form({ title: " News ", body, template: "newsletter" }))).toMatchObject({ ok: true, title: "News", template: "newsletter" });
    expect(checkPostForm(form({ title: "News", body, template: "made-up" }))).toMatchObject({ ok: true, template: null });
  });

  test("needs a title and some writing", () => {
    expect(checkPostForm(form({ title: "", body: "" }))).toMatchObject({
      ok: false,
      errors: { title: "Give the post a title.", body: "Write something in the post." },
    });
  });
});

describe("checkComment", () => {
  test("trims and limits comments", () => {
    expect(checkComment("  Nice  ")).toEqual({ ok: true, body: "Nice" });
    expect(checkComment("   ")).toMatchObject({ ok: false });
    expect(checkComment("x".repeat(COMMENT_MAX + 1))).toMatchObject({ ok: false });
  });
});
