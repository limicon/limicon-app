/**
 * Security headers on every response (docs/strategy-security.md → How access works). Routes that
 * set their own value, such as the sandboxing CSP on uploaded media, keep it.
 */

/** Headers that don't depend on the request. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // No other site may frame the app, so it can't hide the app under a decoy and steal clicks.
  // `frame-ancestors` in the CSP says the same to current browsers.
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Voice notes record from the microphone; nothing uses the camera or location.
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
  // Without includeSubDomains, so it never binds other limicon.org hosts.
  "Strict-Transport-Security": "max-age=31536000",
};

/**
 * The content security policy for a response. Scripts run only from the app's own address or
 * inline with this response's nonce, which React Router adds to the scripts it writes into the
 * page (app/entry.server.tsx). Images may come from any https address, since rich text can link
 * them. Form posts may go to the app and, through sign-in's redirects, to Supabase and Google:
 * browsers apply `form-action` to every redirect a form post follows. Without a Supabase address,
 * form posts stay on the app.
 */
export function contentSecurityPolicy({ nonce, supabaseUrl }: { nonce: string; supabaseUrl?: string }): string {
  const formTargets = supabaseUrl ? [new URL(supabaseUrl).origin, "https://accounts.google.com"] : [];
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // React writes style attributes, such as theme colors, into the server-rendered page.
    "style-src 'self' 'unsafe-inline'",
    // blob: shows a photo in the cropper before it uploads.
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    ["form-action 'self'", ...formTargets].join(" "),
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Adds the security headers a response doesn't already have, so a route's own value wins. `csp`
 * is false under `npm run dev`, whose hot reloading needs inline scripts and a websocket the CSP
 * doesn't allow.
 */
export function applySecurityHeaders(
  headers: Headers,
  { nonce, supabaseUrl, csp }: { nonce: string; supabaseUrl?: string; csp: boolean },
): void {
  const values: Record<string, string> = { ...SECURITY_HEADERS };
  if (csp) values["Content-Security-Policy"] = contentSecurityPolicy({ nonce, supabaseUrl });
  for (const [name, value] of Object.entries(values)) {
    if (!headers.has(name)) headers.set(name, value);
  }
}

/** A fresh nonce for one response's inline scripts. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
