import { env, waitUntil } from "cloudflare:workers";
import { redirect, type MiddlewareFunction } from "react-router";

import { servicesContext, type Viewer } from "~/context";
import { createDb, type Db } from "~/lib/db.server";
import type { Membership } from "~/lib/membership";
import { getMembership } from "~/lib/membership.server";
import { createSupabaseClient } from "~/lib/supabase.server";

/**
 * Root middleware, and the only module that reads the Worker's environment: everything else
 * gets what it needs from `servicesContext`. It gives every loader and action the request's
 * Supabase client, the signed-in viewer, a lazily opened database connection and the viewer's
 * membership. On the way out it adds any session cookies Supabase wrote, and closes the database
 * connection after the response is sent.
 */
export const servicesMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const cookieHeaders = new Headers();
  const supabase = createSupabaseClient(request, cookieHeaders, {
    url: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
  });

  // Verifies the session token, refreshing it when it has expired.
  const { data } = await supabase.auth.getClaims();
  const viewer: Viewer = data
    ? { userId: data.claims.sub, email: data.claims.email ?? null }
    : null;

  let sql: Db | undefined;
  const db = () => (sql ??= createDb(env.HYPERDRIVE.connectionString));
  let membership: Promise<Membership> | undefined;

  context.set(servicesContext, {
    supabase,
    viewer,
    db,
    membership: () => (membership ??= getMembership(db(), viewer?.userId ?? null)),
    settings: { googleSignInEnabled: env.GOOGLE_SIGN_IN_ENABLED === "true" },
  });

  try {
    const response = await next();
    for (const cookie of cookieHeaders.getSetCookie()) {
      response.headers.append("Set-Cookie", cookie);
    }
    cookieHeaders.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") response.headers.set(key, value);
    });
    // Keeps a test site, shared only by link, out of search results.
    if (env.SEARCH_INDEXING !== "on") response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  } finally {
    if (sql) waitUntil(sql.end());
  }
};

/** Route middleware for pages that need a signed-in account: sends visitors to sign in. */
export const requireViewer: MiddlewareFunction<Response> = ({ context }) => {
  if (!context.get(servicesContext).viewer) throw redirect("/sign-in");
};

/**
 * Route middleware for the admin console: visitors go to sign in, and signed-in people without
 * an admin permission get a plain not-found, so the console's pages aren't advertised.
 */
export const requireAdmin: MiddlewareFunction<Response> = async ({ context }) => {
  const services = context.get(servicesContext);
  if (!services.viewer) throw redirect("/sign-in");
  const { isAdmin } = await services.membership();
  if (!isAdmin) throw new Response("Not found", { status: 404 });
};

/** Route middleware for the Members area: anyone without access sees why instead. */
export const requireMembership: MiddlewareFunction<Response> = async ({ context }) => {
  const { status } = await context.get(servicesContext).membership();
  if (status !== "member") throw redirect("/members-only");
};
