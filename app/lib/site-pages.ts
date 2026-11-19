/**
 * The public website's pages: their sections, and reading a page posted from the page editor.
 * Shared by the editor, the pages and the server, so all three agree on what a section holds.
 *
 * A page is a list of sections. The editor posts their order and kinds as `sections` (JSON of
 * `{ id, type }`), and each section's content as fields named `<field>:<id>`; the server rebuilds
 * the sections from those fields, keeping only what each kind uses.
 */
import { MEDIA_KEY } from "~/lib/media";
import { readRichText, safeHref, type RichDoc } from "~/lib/rich-text";

export const SECTION_KINDS = [
  { type: "text", label: "Text", help: "Headings, paragraphs, lists, links and images, like a document." },
  { type: "image", label: "Image", help: "One picture, with an optional caption." },
  { type: "imageText", label: "Image and text", help: "A picture beside text." },
  { type: "columns", label: "Columns", help: "Two or three blocks of text side by side." },
  { type: "buttons", label: "Buttons", help: "One or more buttons linking to pages, such as Register." },
  { type: "event", label: "Event", help: "The event's image, name, teaser, dates and About, from the Settings page." },
] as const;
export type SectionType = (typeof SECTION_KINDS)[number]["type"];

export const BACKGROUNDS = [
  { value: "plain", label: "Plain" },
  { value: "tint", label: "Tinted" },
  { value: "dark", label: "Dark" },
] as const;
export type Background = (typeof BACKGROUNDS)[number]["value"];

export type SiteButton = { label: string; href: string; style: "primary" | "secondary" };

export type Section = { id: string; background: Background } & (
  | { type: "event" }
  | { type: "text"; doc: RichDoc | null }
  | { type: "image"; imageKey: string | null; alt: string; caption: string; size: "medium" | "full" }
  | { type: "imageText"; imageKey: string | null; alt: string; doc: RichDoc | null; imageSide: "left" | "right" }
  | { type: "columns"; columns: (RichDoc | null)[] }
  | { type: "buttons"; buttons: SiteButton[]; align: "left" | "center" }
);

export type PageMeta = { title: string; slug: string; menuLabel: string; inMenu: boolean; published: boolean };

export const SECTIONS_MAX = 60;
export const TITLE_MAX = 120;
export const MENU_LABEL_MAX = 40;
export const BUTTONS_MAX = 4;

/** Addresses the app already uses, which a page can't take. */
export const RESERVED_SLUGS = new Set([
  "home", "admin", "members", "members-only", "account", "sign-in", "sign-out", "tickets", "faq",
  "privacy", "conduct", "media", "auth", "api", "assets", "favicon.ico",
  // The console's address for a page not yet saved: /admin/website/new.
  "new",
]);

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ID = /^[a-z0-9-]{1,40}$/;

/** A page's address from its title, such as "Our history" → `our-history`. */
export function slugFromTitle(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

/** A new section, empty, ready for the editor. */
export function newSection(type: SectionType, id: string): Section {
  const base = { id, background: "plain" as Background };
  switch (type) {
    case "event":
      return { ...base, type };
    case "text":
      return { ...base, type, doc: null };
    case "image":
      return { ...base, type, imageKey: null, alt: "", caption: "", size: "medium" };
    case "imageText":
      return { ...base, type, imageKey: null, alt: "", doc: null, imageSide: "left" };
    case "columns":
      return { ...base, type, columns: [null, null] };
    case "buttons":
      return { ...base, type, buttons: [{ label: "", href: "", style: "primary" }], align: "left" };
  }
}

/** Cleans sections read back from the database, dropping anything malformed. */
export function cleanStoredSections(value: unknown): Section[] {
  if (!Array.isArray(value)) return [];
  const sections: Section[] = [];
  for (const raw of value.slice(0, SECTIONS_MAX)) {
    const s = raw as Record<string, unknown>;
    if (!s || typeof s.id !== "string" || !ID.test(s.id)) continue;
    const get = (name: string) => s[name];
    const section = buildSection(String(s.type), s.id, {
      get: (name) => get(name),
      getAll: (name) => (Array.isArray(get(name)) ? (get(name) as unknown[]) : []),
      doc: (value) => readRichTextValue(value),
    });
    if (section) sections.push(section);
  }
  return sections;
}

function readRichTextValue(value: unknown): RichDoc | null {
  if (value && typeof value === "object") return readRichText(JSON.stringify(value));
  return null;
}

type Source = {
  get(name: string): unknown;
  getAll(name: string): unknown[];
  doc(value: unknown): RichDoc | null;
};

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const imageKey = (value: unknown) => (typeof value === "string" && MEDIA_KEY.test(value) ? value : null);

function buildSection(type: string, id: string, src: Source): Section | null {
  const background = pick(src.get("background"), ["plain", "tint", "dark"] as const, "plain");
  const base = { id, background };
  switch (type) {
    case "event":
      return { ...base, type };
    case "text":
      return { ...base, type, doc: src.doc(src.get("doc")) };
    case "image":
      return {
        ...base,
        type,
        imageKey: imageKey(src.get("imageKey")),
        alt: str(src.get("alt"), 300),
        caption: str(src.get("caption"), 300),
        size: pick(src.get("size"), ["medium", "full"] as const, "medium"),
      };
    case "imageText":
      return {
        ...base,
        type,
        imageKey: imageKey(src.get("imageKey")),
        alt: str(src.get("alt"), 300),
        doc: src.doc(src.get("doc")),
        imageSide: pick(src.get("imageSide"), ["left", "right"] as const, "left"),
      };
    case "columns": {
      const columns = src.getAll("columns").slice(0, 3).map((c) => src.doc(c));
      while (columns.length < 2) columns.push(null);
      return { ...base, type, columns };
    }
    case "buttons": {
      const raw = src.getAll("buttons").slice(0, BUTTONS_MAX) as Record<string, unknown>[];
      const buttons = raw
        .map((b) => ({
          label: str(b?.label, 60),
          href: safeHref(str(b?.href, 2000)) ?? "",
          style: pick(b?.style, ["primary", "secondary"] as const, "primary"),
        }))
        .filter((b) => b.label && b.href);
      return { ...base, type, buttons, align: pick(src.get("align"), ["left", "center"] as const, "left") };
    }
    default:
      return null;
  }
}

export type PageErrors = Partial<Record<"title" | "slug" | "menuLabel" | "sections", string>> & {
  /** Problems inside a section, by its id. */
  section?: Record<string, string>;
};

/**
 * Reads a page posted from the editor. `isHome` keeps the front page's address and keeps it
 * published. Returns the page, or what was posted with the problems to fix.
 */
export function readPageForm(
  form: { get(name: string): unknown; getAll(name: string): unknown[] },
  isHome: boolean,
): { ok: true; meta: PageMeta; sections: Section[] } | { ok: false; errors: PageErrors } {
  const errors: PageErrors = {};
  const title = str(form.get("title"), 1000);
  if (!title) errors.title = "Give the page a title.";
  else if ([...title].length > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters.`;
  const slug = isHome ? "home" : str(form.get("slug"), 100).toLowerCase();
  if (!isHome) {
    if (!SLUG.test(slug)) errors.slug = "Use lowercase letters, numbers and dashes, such as our-history.";
    else if (RESERVED_SLUGS.has(slug)) errors.slug = "Another part of the site uses that address. Choose another.";
  }
  const menuLabel = str(form.get("menuLabel"), 1000);
  if ([...menuLabel].length > MENU_LABEL_MAX) errors.menuLabel = `Keep the menu name to ${MENU_LABEL_MAX} characters.`;

  let order: { id: string; type: string }[] = [];
  try {
    const parsed = JSON.parse(String(form.get("sections") ?? "[]"));
    if (Array.isArray(parsed)) order = parsed.filter((s) => s && typeof s.id === "string" && ID.test(s.id) && typeof s.type === "string");
  } catch {
    errors.sections = "The page couldn't be read. Reload it and try again.";
  }
  if (order.length > SECTIONS_MAX) errors.sections = `Keep the page to ${SECTIONS_MAX} sections.`;

  const sections: Section[] = [];
  for (const { id, type } of order.slice(0, SECTIONS_MAX)) {
    const field = (name: string) => form.get(`${name}:${id}`);
    const all = (name: string) => form.getAll(`${name}:${id}`);
    const section = buildSection(type, id, {
      get: field,
      getAll: (name) => {
        if (name === "columns") return all("column");
        if (name === "buttons") {
          const labels = all("btnLabel");
          const hrefs = all("btnHref");
          const styles = all("btnStyle");
          return labels.map((label, i) => ({ label, href: hrefs[i], style: styles[i] }));
        }
        return all(name);
      },
      doc: (value) => readRichText(value),
    });
    if (!section) continue;
    if (section.type === "buttons") {
      const labels = all("btnLabel").map((v) => str(v, 60));
      const hrefs = all("btnHref").map((v) => str(v, 2000));
      const bad = labels.findIndex((label, i) => (label || hrefs[i]) && (!label || !safeHref(hrefs[i])));
      if (bad >= 0) (errors.section ??= {})[id] = "Each button needs a label and a link starting with https://, mailto: or /.";
    }
    sections.push(section);
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    meta: {
      title,
      slug,
      menuLabel,
      inMenu: isHome ? false : form.get("inMenu") === "on",
      published: isHome ? true : form.get("published") === "on",
    },
    sections,
  };
}

/** The page's address on the site. */
export function pagePath(slug: string) {
  return slug === "home" ? "/" : `/${slug}`;
}
