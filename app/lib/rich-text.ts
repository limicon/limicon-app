/**
 * Rich text that admins write (the event's About, the policies) is stored as a TipTap document:
 * JSON, never HTML. `cleanRichText` keeps only the nodes, marks and attributes the app renders,
 * so nothing an admin pastes can run as a script, and the renderer draws only those.
 */
import { mediaKeyFromUrl } from "~/lib/media";

export type RichMark = { type: "bold" | "italic" | "underline" | "strike" } | { type: "link"; attrs: { href: string } };

export type RichNode =
  | { type: "doc"; content: RichNode[] }
  | { type: "paragraph"; attrs?: { textAlign?: Align }; content?: RichNode[] }
  | { type: "heading"; attrs: { level: 2 | 3 | 4; textAlign?: Align }; content?: RichNode[] }
  | { type: "text"; text: string; marks?: RichMark[] }
  | { type: "bulletList"; content: RichNode[] }
  | { type: "orderedList"; attrs?: { start?: number }; content: RichNode[] }
  | { type: "listItem"; content: RichNode[] }
  | { type: "blockquote"; content: RichNode[] }
  | { type: "hardBreak" }
  | { type: "horizontalRule" }
  | { type: "image"; attrs: { src: string; alt?: string } };

export type RichDoc = Extract<RichNode, { type: "doc" }>;
type Align = "left" | "center" | "right";

const ALIGNS = new Set(["left", "center", "right"]);
const SIMPLE_MARKS = new Set(["bold", "italic", "underline", "strike"]);
const CONTAINERS = new Set(["bulletList", "orderedList", "listItem", "blockquote"]);
const MAX_NODES = 20_000;

/** An address a link may point to: the web, email, or a page or file of this site. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href.slice(0, 2000);
  if (/^\/(?!\/)[^\s]*$/.test(href)) return href.slice(0, 2000);
  return null;
}

/** Images come only from the app's own media bucket, or the web over https. */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (mediaKeyFromUrl(value)) return value;
  return /^https:\/\/[^\s"'<>]+$/i.test(value) ? value.slice(0, 2000) : null;
}

/**
 * Keeps what the renderer supports from an untrusted document, dropping anything else. Returns
 * null for something that isn't a document at all, or one with no text or images.
 */
export function cleanRichText(input: unknown): RichDoc | null {
  let count = 0;
  const clean = (node: unknown): RichNode | null => {
    if (++count > MAX_NODES || !node || typeof node !== "object") return null;
    const n = node as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown; text?: unknown; marks?: unknown };
    const children = () => (Array.isArray(n.content) ? n.content.map(clean).filter((c): c is RichNode => c !== null) : []);
    const align = () => (ALIGNS.has(n.attrs?.textAlign as string) && n.attrs?.textAlign !== "left" ? { textAlign: n.attrs!.textAlign as Align } : undefined);
    switch (n.type) {
      case "text": {
        if (typeof n.text !== "string" || !n.text) return null;
        const marks: RichMark[] = [];
        if (Array.isArray(n.marks)) {
          for (const m of n.marks as { type?: unknown; attrs?: { href?: unknown } }[]) {
            if (SIMPLE_MARKS.has(m?.type as string)) marks.push({ type: m.type as "bold" });
            else if (m?.type === "link") {
              const href = safeHref(m.attrs?.href);
              if (href) marks.push({ type: "link", attrs: { href } });
            }
          }
        }
        return { type: "text", text: n.text.slice(0, 100_000), ...(marks.length ? { marks } : {}) };
      }
      case "paragraph": {
        const attrs = align();
        return { type: "paragraph", ...(attrs ? { attrs } : {}), content: children() };
      }
      case "heading": {
        const level = [2, 3, 4].includes(n.attrs?.level as number) ? (n.attrs!.level as 2 | 3 | 4) : 2;
        return { type: "heading", attrs: { level, ...align() }, content: children() };
      }
      case "orderedList": {
        const start = Number(n.attrs?.start);
        return { type: "orderedList", ...(Number.isInteger(start) && start > 1 && start < 10_000 ? { attrs: { start } } : {}), content: children() };
      }
      case "hardBreak":
      case "horizontalRule":
        return { type: n.type };
      case "image": {
        const src = safeImageSrc(n.attrs?.src);
        if (!src) return null;
        const alt = typeof n.attrs?.alt === "string" ? n.attrs.alt.slice(0, 300) : "";
        return { type: "image", attrs: { src, ...(alt ? { alt } : {}) } };
      }
      default:
        if (CONTAINERS.has(n.type as string)) return { type: n.type as "blockquote", content: children() };
        return null;
    }
  };
  if (!input || typeof input !== "object" || (input as { type?: unknown }).type !== "doc") return null;
  const doc = { type: "doc" as const, content: ((input as { content?: unknown }).content as unknown[] | undefined ?? []).map(clean).filter((c): c is RichNode => c !== null) };
  if (count > MAX_NODES) return null;
  return hasSubstance(doc) ? doc : null;
}

function hasSubstance(node: RichNode): boolean {
  if (node.type === "text") return node.text.trim() !== "";
  if (node.type === "image" || node.type === "horizontalRule") return true;
  return "content" in node && Array.isArray(node.content) && node.content.some(hasSubstance);
}

/** Reads a document posted from an editor's hidden field. Empty or invalid gives null. */
export function readRichText(value: unknown): RichDoc | null {
  if (typeof value !== "string" || !value || value.length > 2_000_000) return null;
  try {
    return cleanRichText(JSON.parse(value));
  } catch {
    return null;
  }
}

/** A document's text, a line per block and "• " before list items, for search and plain-text uses. */
export function richTextToPlain(doc: RichDoc | null): string {
  if (!doc) return "";
  const lines: string[] = [];
  const inline = (node: RichNode): string =>
    node.type === "text" ? node.text : node.type === "hardBreak" ? "\n" : "content" in node && node.content ? node.content.map(inline).join("") : "";
  const block = (node: RichNode, prefix = "") => {
    if (node.type === "paragraph" || node.type === "heading") lines.push(prefix + inline(node));
    else if (node.type === "listItem") node.content.forEach((child, i) => block(child, i === 0 ? prefix : ""));
    else if (node.type === "bulletList") node.content.forEach((item) => block(item, "• "));
    else if (node.type === "orderedList") node.content.forEach((item, i) => block(item, `${(node.attrs?.start ?? 1) + i}. `));
    else if ("content" in node && node.content) node.content.forEach((child) => block(child, prefix));
  };
  doc.content.forEach((node) => block(node));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A document from plain text: a paragraph per line. */
export function plainToRichText(text: string): RichDoc {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })),
  };
}

/** Every /media/ file a document refers to, as images or links. */
export function mediaKeysIn(doc: RichDoc | null): string[] {
  const keys = new Set<string>();
  const walk = (node: RichNode) => {
    if (node.type === "image") {
      const key = mediaKeyFromUrl(node.attrs.src);
      if (key) keys.add(key);
    }
    if (node.type === "text") {
      for (const mark of node.marks ?? []) {
        const key = mark.type === "link" ? mediaKeyFromUrl(mark.attrs.href) : null;
        if (key) keys.add(key);
      }
    }
    if ("content" in node && Array.isArray(node.content)) node.content.forEach(walk);
  };
  if (doc) walk(doc);
  return [...keys];
}
