import { describe, expect, test } from "vitest";

import { cleanRichText, mediaKeysIn, readRichText, safeHref } from "./rich-text";

const key = "3f2a9c1e-1111-4222-8333-444455556666.png";
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("cleanRichText", () => {
  test("keeps the formatting the editor offers", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [text("Welcome")] },
      { type: "paragraph", content: [text("Bold", [{ type: "bold" }, { type: "underline" }]), text(" and "), text("a link", [{ type: "link", attrs: { href: "https://limicon.org", target: "_blank" } }])] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("🌱 one")] }] }] },
      { type: "image", attrs: { src: `/media/${key}`, alt: "The knot", title: "dropped" } },
    );
    expect(cleanRichText(input)).toEqual(
      doc(
        { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [text("Welcome")] },
        { type: "paragraph", content: [text("Bold", [{ type: "bold" }, { type: "underline" }]), text(" and "), text("a link", [{ type: "link", attrs: { href: "https://limicon.org" } }])] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("🌱 one")] }] }] },
        { type: "image", attrs: { src: `/media/${key}`, alt: "The knot" } },
      ),
    );
  });

  test("drops script links, unknown nodes and images from other places", () => {
    const input = doc(
      { type: "paragraph", content: [text("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]), { type: "iframe", attrs: { src: "https://evil.example" } }] },
      { type: "image", attrs: { src: "data:image/svg+xml;base64,AAAA" } },
      { type: "image", attrs: { src: "/media/../secrets" } },
      { type: "heading", attrs: { level: 1 }, content: [text("Title")] },
    );
    expect(cleanRichText(input)).toEqual(
      doc({ type: "paragraph", content: [text("click")] }, { type: "heading", attrs: { level: 2 }, content: [text("Title")] }),
    );
  });

  test("an empty document is no document", () => {
    expect(cleanRichText(doc({ type: "paragraph", content: [] }, { type: "paragraph", content: [text("   ")] }))).toBeNull();
    expect(cleanRichText({ type: "paragraph" })).toBeNull();
    expect(readRichText("not json")).toBeNull();
    expect(readRichText("")).toBeNull();
  });
});

test("safeHref allows the web, email and this site's own pages only", () => {
  expect(safeHref("mailto:team@limicon.org")).toBe("mailto:team@limicon.org");
  expect(safeHref("/conduct")).toBe("/conduct");
  expect(safeHref("//evil.example")).toBeNull();
  expect(safeHref(" JavaScript:alert(1)")).toBeNull();
});

test("mediaKeysIn finds uploaded images and files", () => {
  const input = cleanRichText(
    doc(
      { type: "image", attrs: { src: `/media/${key}` } },
      { type: "paragraph", content: [text("agenda.pdf", [{ type: "link", attrs: { href: `/media/${key.replace(".png", ".pdf")}` } }])] },
    ),
  );
  expect(mediaKeysIn(input)).toEqual([key, key.replace(".png", ".pdf")]);
});
