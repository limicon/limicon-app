import { describe, expect, test } from "vitest";

import { applySecurityHeaders, contentSecurityPolicy, createNonce } from "./security-headers";

describe("contentSecurityPolicy", () => {
  const policy = contentSecurityPolicy({ nonce: "abc123", supabaseUrl: "https://example.supabase.co" });
  const directive = (name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `));

  test("lets scripts run only from the app or with the response's nonce", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123'");
  });

  test("lets no other site frame the app", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  test("lets sign-in's form post follow its redirects to Supabase and Google", () => {
    expect(directive("form-action")).toBe("form-action 'self' https://example.supabase.co https://accounts.google.com");
  });

  test("names only Supabase's origin, whatever path its address has", () => {
    const local = contentSecurityPolicy({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321/" });
    expect(local).toContain("form-action 'self' http://127.0.0.1:54321 https://accounts.google.com");
  });

  test("keeps form posts on the app without a Supabase address", () => {
    expect(contentSecurityPolicy({ nonce: "n" })).toContain("form-action 'self';");
  });
});

describe("applySecurityHeaders", () => {
  test("adds the headers and the CSP", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { nonce: "n", csp: true });
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain("'nonce-n'");
  });

  test("keeps a route's own value", () => {
    const headers = new Headers({ "Content-Security-Policy": "default-src 'none'; sandbox" });
    applySecurityHeaders(headers, { nonce: "n", csp: true });
    expect(headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
  });

  test("leaves the CSP out when told to, for npm run dev", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { nonce: "n", csp: false });
    expect(headers.has("Content-Security-Policy")).toBe(false);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("createNonce", () => {
  test("is new for every response", () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(nonce);
  });
});
