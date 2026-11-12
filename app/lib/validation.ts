/**
 * Trims and lowercases an email address, or returns null when it isn't plausibly one.
 * Supabase does the real check when it sends the sign-in link.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
