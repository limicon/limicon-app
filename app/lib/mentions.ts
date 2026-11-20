/**
 * @mentions in Community posts and comments. The text keeps "@Name" as typed; alongside it, each
 * post or comment stores who those names are, so pages can link them and the server knows whom to
 * notify. "@everyone", which only admins may use, tags every member.
 */
export type Mention = { id: string; name: string };

export const EVERYONE = "everyone";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "@Name" not followed by more of a name, so "@Ada" doesn't match inside "@Adaline". */
const pattern = (name: string) => new RegExp(`@${escape(name)}(?![\\p{L}\\p{N}_])`, "u");

/** Whether `body` says "@everyone". */
export const mentionsEveryone = (body: string) => pattern(EVERYONE).test(body.toLowerCase());

/** The mentions whose "@Name" still appears in `body`, each person once. */
export function mentionsIn(body: string, mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  return mentions.filter((m) => {
    if (seen.has(m.id) || !m.name || !pattern(m.name).test(body)) return false;
    seen.add(m.id);
    return true;
  });
}

export type Segment = { text: string } | { text: string; mention: Mention };

/** Splits `body` into plain text and "@Name" pieces, longest names first so they win over shorter ones. */
export function splitMentions(body: string, mentions: Mention[]): Segment[] {
  const named = [...mentions].filter((m) => m.name).sort((a, b) => b.name.length - a.name.length);
  if (!named.length) return [{ text: body }];
  const any = new RegExp(named.map((m) => `@${escape(m.name)}(?![\\p{L}\\p{N}_])`).join("|"), "gu");
  const segments: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(any)) {
    const mention = named.find((m) => `@${m.name}` === match[0])!;
    if (match.index > last) segments.push({ text: body.slice(last, match.index) });
    segments.push({ text: match[0], mention });
    last = match.index + match[0].length;
  }
  if (last < body.length) segments.push({ text: body.slice(last) });
  return segments;
}

/** The word being typed after "@" just before the cursor, or null when the cursor isn't in one. */
export function mentionQuery(textBeforeCursor: string): { query: string; start: number } | null {
  const match = /(^|[\s(])@([\p{L}\p{N}_.'-]{0,30})$/u.exec(textBeforeCursor);
  if (!match) return null;
  return { query: match[2]!, start: textBeforeCursor.length - match[2]!.length - 1 };
}
