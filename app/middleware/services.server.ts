import { waitUntil } from "cloudflare:workers";
import { redirect, type MiddlewareFunction } from "react-router";

import { servicesContext, type Viewer } from "~/context";
import { createDb, type Db } from "~/lib/db.server";
import { createSupabaseClient } from "~/lib/supabase.server";

/**
 * Root middleware: gives every loader and action the request's Supabase client, the signed-in
 * viewer and a lazily opened database connection. On the way out it adds any session cookies
 * Supabase wrote, and closes the database connection after the response is sent.
 */
export const servicesMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const cookieHeaders = new Headers();
  const supabase = createSupabaseClient(request, cookieHeaders);

  // Verifies the session token, refreshing it when it has expired.
  const { data } = await supabase.auth.getClaims();
  const viewer: Viewer = data
    ? { userId: data.claims.sub, email: data.claims.email ?? null }
    : null;

  let sql: Db | undefined;
  context.set(servicesContext, {
    supabase,
    viewer,
    db: () => (sql ??= createDb()),
  });

  try {
    const response = await next();
    for (const cookie of cookieHeaders.getSetCookie()) {
      response.headers.append("Set-Cookie", cookie);
    }
    cookieHeaders.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") response.headers.set(key, value);
    });
    return response;
  } finally {
    if (sql) waitUntil(sql.end());
  }
};

/** Route middleware for members-only pages: sends visitors to the sign-in page. */
export const requireViewer: MiddlewareFunction<Response> = ({ context }) => {
  if (!context.get(servicesContext).viewer) throw redirect("/sign-in");
};
