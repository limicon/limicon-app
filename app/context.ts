import { createContext } from "react-router";

import type { Privilege } from "~/lib/admin-roles";
import type { Db } from "~/lib/db.server";
import type { Membership } from "~/lib/membership";
import type { SupabaseClient } from "~/lib/supabase.server";

/** The signed-in member, or null for a visitor. Set by the root middleware. */
export type Viewer = { userId: string; email: string | null } | null;

export type RequestServices = {
  supabase: SupabaseClient;
  viewer: Viewer;
  /** Opens the request's database connection on first use. */
  db: () => Db;
  /** The viewer's access to the Members area, looked up once per request on first use. */
  membership: () => Promise<Membership>;
  /** What the viewer may do in the admin console, from their role; empty for everyone else. */
  privileges: () => Promise<Set<Privilege>>;
  settings: {
    googleSignInEnabled: boolean;
    /** The public Limicon Schedule Google calendar members can subscribe to, once it's set up. */
    scheduleCalendarId: string | null;
    /** Whether RSVPing sends a Google Calendar invite: the calendar sync is fully set up. */
    calendarInvites: boolean;
  };
  /** The bucket holding uploaded images and files, served at /media/<key>. */
  media: R2Bucket;
  /** This response's CSP nonce, for the inline scripts in the page (app/lib/security-headers.ts). */
  nonce: string;
};

export const servicesContext = createContext<RequestServices>();
