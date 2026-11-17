import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";

export type SupabaseSettings = { url: string; publishableKey: string };

/**
 * A Supabase client for one request, used for sign-in only: data goes through Hyperdrive
 * (`db.server.ts`). Session cookies are read from the request, and any the client writes,
 * such as a refreshed token, collect in `responseHeaders` for the root middleware to add to
 * the response.
 */
export function createSupabaseClient(
  request: Request,
  responseHeaders: Headers,
  settings: SupabaseSettings,
) {
  return createServerClient(settings.url, settings.publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
          ({ name, value }) => ({ name, value: value ?? "" }),
        );
      },
      setAll(cookies, headers) {
        for (const { name, value, options } of cookies) {
          responseHeaders.append("Set-Cookie", serializeCookieHeader(name, value, options));
        }
        // Keeps responses that carry a session token out of shared caches.
        for (const [key, value] of Object.entries(headers)) {
          responseHeaders.set(key, value);
        }
      },
    },
  });
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;
