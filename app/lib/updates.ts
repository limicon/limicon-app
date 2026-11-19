/**
 * The Members area's Updates page: posts by the Organizing Team, which members like and comment
 * on. docs/feature-updates.md covers who may do what.
 */
import { readRichText, type RichDoc } from "~/lib/rich-text";

export const POST_TITLE_MAX = 200;
export const COMMENT_MAX = 2000;

/**
 * Templates a new post can start from. Newsletter holds the place until its layout is written.
 */
export const POST_TEMPLATES: { key: string; label: string; title: string; body: RichDoc }[] = [
  {
    key: "newsletter",
    label: "Newsletter",
    title: "Newsletter",
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "The Newsletter template is still to be written. Write this issue here for now.", marks: [{ type: "italic" }] }] },
      ],
    },
  },
];

export function findTemplate(key: unknown) {
  return POST_TEMPLATES.find((t) => t.key === key) ?? null;
}

type FormLike = { get(name: string): unknown };

/** A post's title, body and template from its form. */
export function checkPostForm(form: FormLike):
  | { ok: true; title: string; body: RichDoc; template: string | null }
  | { ok: false; input: { title: string }; errors: { title?: string; body?: string } } {
  const title = typeof form.get("title") === "string" ? (form.get("title") as string).trim() : "";
  const body = readRichText(form.get("body"));
  const template = findTemplate(form.get("template"))?.key ?? null;
  const errors: { title?: string; body?: string } = {};
  if (!title) errors.title = "Give the post a title.";
  else if ([...title].length > POST_TITLE_MAX) errors.title = `Keep the title to ${POST_TITLE_MAX} characters.`;
  if (!body) errors.body = "Write something in the post.";
  if (errors.title || errors.body) return { ok: false, input: { title }, errors };
  return { ok: true, title, body: body!, template };
}

/** A comment's text, trimmed, or what's wrong with it. */
export function checkComment(value: unknown): { ok: true; body: string } | { ok: false; problem: string } {
  const body = typeof value === "string" ? value.trim() : "";
  if (!body) return { ok: false, problem: "Write a comment first." };
  if ([...body].length > COMMENT_MAX) return { ok: false, problem: `Keep comments to ${COMMENT_MAX} characters.` };
  return { ok: true, body };
}
