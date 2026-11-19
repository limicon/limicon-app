import { describe, expect, test } from "vitest";

import { cleanStoredSections, readPageForm, slugFromTitle } from "./site-pages";

const key = "3f2a9c1e-1111-4222-8333-444455556666.png";
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** A form as the page editor posts it: one value per name, except where repeated. */
function form(fields: Record<string, string | string[]>) {
  return {
    get: (name: string) => {
      const v = fields[name];
      return Array.isArray(v) ? v[0] : (v ?? null);
    },
    getAll: (name: string) => {
      const v = fields[name];
      return v === undefined ? [] : Array.isArray(v) ? v : [v];
    },
  };
}

describe("readPageForm", () => {
  test("rebuilds each section from its own fields, in the posted order", () => {
    const result = readPageForm(
      form({
        title: " Our history ",
        slug: "our-history",
        menuLabel: "History",
        inMenu: "on",
        sections: JSON.stringify([
          { id: "a", type: "imageText" },
          { id: "b", type: "buttons" },
          { id: "c", type: "columns" },
        ]),
        "background:a": "tint",
        "imageKey:a": key,
        "alt:a": "The first gathering",
        "imageSide:a": "right",
        "doc:a": JSON.stringify(doc("It began in 2020.")),
        "btnLabel:b": ["Register", ""],
        "btnHref:b": ["/tickets", ""],
        "btnStyle:b": ["primary", "secondary"],
        "align:b": "center",
        "column:c": [JSON.stringify(doc("One")), JSON.stringify(doc("Two")), JSON.stringify(doc("Three"))],
      }),
      false,
    );
    expect(result).toEqual({
      ok: true,
      meta: { title: "Our history", slug: "our-history", menuLabel: "History", inMenu: true, published: false },
      sections: [
        { id: "a", background: "tint", type: "imageText", imageKey: key, alt: "The first gathering", imageSide: "right", doc: doc("It began in 2020.") },
        { id: "b", background: "plain", type: "buttons", buttons: [{ label: "Register", href: "/tickets", style: "primary" }], align: "center" },
        { id: "c", background: "plain", type: "columns", columns: [doc("One"), doc("Two"), doc("Three")] },
      ],
    });
  });

  test("the front page keeps its address and stays published", () => {
    const result = readPageForm(form({ title: "Home", slug: "elsewhere", sections: "[]" }), true);
    expect(result).toMatchObject({ ok: true, meta: { slug: "home", published: true, inMenu: false } });
  });

  test("refuses a missing title, a bad or taken address, and a button without a safe link", () => {
    const result = readPageForm(
      form({
        title: "",
        slug: "faq",
        sections: JSON.stringify([{ id: "b", type: "buttons" }]),
        "btnLabel:b": "Click",
        "btnHref:b": "javascript:alert(1)",
      }),
      false,
    );
    expect(result).toMatchObject({ ok: false, errors: { title: expect.any(String), slug: expect.any(String), section: { b: expect.any(String) } } });
    expect(readPageForm(form({ title: "X", slug: "Has Spaces", sections: "[]" }), false)).toMatchObject({ ok: false, errors: { slug: expect.any(String) } });
  });

  test("drops unknown kinds of section and images that aren't uploads", () => {
    const result = readPageForm(
      form({
        title: "T",
        slug: "t",
        sections: JSON.stringify([{ id: "x", type: "iframe" }, { id: "i", type: "image" }]),
        "imageKey:i": "../../secret.png",
      }),
      false,
    );
    expect(result).toMatchObject({ ok: true, sections: [{ id: "i", type: "image", imageKey: null }] });
  });
});

test("cleanStoredSections keeps good sections and skips broken ones", () => {
  expect(
    cleanStoredSections([
      { id: "event", type: "event" },
      { id: "t", type: "text", doc: doc("Hi"), background: "dark" },
      { id: "BAD ID", type: "text" },
      { id: "u", type: "unknown" },
      "nonsense",
    ]),
  ).toEqual([
    { id: "event", type: "event", background: "plain" },
    { id: "t", type: "text", doc: doc("Hi"), background: "dark" },
  ]);
  expect(cleanStoredSections(null)).toEqual([]);
});

test("slugFromTitle makes an address from a title", () => {
  expect(slugFromTitle("Our History & Roots!")).toBe("our-history-roots");
  expect(slugFromTitle("???")).toBe("page");
});
