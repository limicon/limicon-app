/**
 * What members can choose to be emailed about, on the Settings page. The keys match the
 * database's check on `profiles.email_notify`. New posts on Updates are on by default.
 */
export const EMAIL_CHOICES = [
  { key: "update_post", label: "A new post on Updates", help: "When the Organizing Team posts news. Not comments on it." },
  { key: "mention", label: "Someone mentions me", help: "In a post, comment or reply, in Community or on Updates." },
  { key: "reply", label: "Someone replies to my comment", help: "In Community or on Updates." },
  { key: "comment", label: "Someone comments on my post", help: "In Community or on Updates. Not replies to other people's comments." },
  { key: "everyone", label: "An admin tags @everyone", help: "" },
] as const;

export type EmailChoice = (typeof EMAIL_CHOICES)[number]["key"];

/** The choices in a submitted form, in the list's order, ignoring anything else. */
export function readEmailChoices(values: unknown[]): EmailChoice[] {
  const picked = new Set(values.map(String));
  return EMAIL_CHOICES.map((c) => c.key).filter((key) => picked.has(key));
}
