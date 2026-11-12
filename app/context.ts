import { createContext } from "react-router";

import type { Db } from "~/lib/db.server";
import type { SupabaseClient } from "~/lib/supabase.server";

/** The signed-in member, or null for a visitor. Set by the root middleware. */
export type Viewer = { userId: string; email: string | null } | null;

export type RequestServices = {
  supabase: SupabaseClient;
  viewer: Viewer;
  /** Opens the request's database connection on first use. */
  db: () => Db;
};

export const servicesContext = createContext<RequestServices>();
