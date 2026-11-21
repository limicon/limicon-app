import { Form, Link, NavLink, Outlet, useLocation, type ShouldRevalidateFunctionArgs } from "react-router";

import { NotificationBell, ProfileMenu } from "~/components/profile-menu";
import { UnseenCount } from "~/components/unseen-count";
import { servicesContext } from "~/context";
import { getRoleNames } from "~/lib/admin-roles.server";
import { countUnreadNotifications } from "~/lib/community.server";
import { getOwnProfile } from "~/lib/profiles.server";
import { countUnseenPosts, markUpdatesSeen } from "~/lib/updates.server";
import { requireMembership } from "~/middleware/services.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [requireMembership];

const onUpdates = (url: string | URL) => /^\/members\/updates(\.data)?\/?$/.test(new URL(url).pathname);
const onNotifications = (url: string | URL) => /^\/members\/notifications(\.data)?\/?$/.test(new URL(url).pathname);

export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition, isAdmin } = await services.membership();
  const db = services.db();
  const userId = services.viewer!.userId;
  // Opening Updates counts as seeing every post on it; elsewhere the menu counts posts since then.
  const unseen = onUpdates(request.url) ? markUpdatesSeen(db, userId).then(() => 0) : countUnseenPosts(db, userId);
  // Members see their own roles beside their name, so everyone knows who holds which.
  // The Notifications page marks everything read itself, so the bell shows none there.
  const unread = onNotifications(request.url) ? Promise.resolve(0) : countUnreadNotifications(db, userId);
  const [roleNames, unseenUpdates, profile, unreadNotifications] = await Promise.all([
    isAdmin ? getRoleNames(db, userId) : Promise.resolve([]),
    unseen,
    getOwnProfile(db, userId),
    unread,
  ]);
  const me = { id: userId, name: [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "You", avatarKey: profile?.avatarKey ?? null };
  return { editionYear: edition?.year ?? null, email: services.viewer?.email ?? null, isAdmin, roleNames, unseenUpdates, unreadNotifications, me };
}

/** Recounts unseen updates and unread notifications on every move between pages, besides the usual reloads. */
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return defaultShouldRevalidate || currentUrl.pathname !== nextUrl.pathname;
}
const sections = [
  { to: "/members", label: "Home", end: true },
  { to: "/members/updates", label: "Updates" },
  { to: "/members/schedule", label: "Schedule" },
  { to: "/members/host", label: "Host a session" },
  { to: "/members/community", label: "Community" },
];

/**
 * The Members area's own shell: a separate site within the site, with its own menu. None of
 * these sections appear on the public website.
 */
export default function MembersLayout({ loaderData }: Route.ComponentProps) {
  const name = loaderData.editionYear ? `Limicon ${loaderData.editionYear}` : "Limicon";
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-[#F4F7F7] text-[#15383F] md:grid md:grid-cols-[15rem_1fr] dark:bg-[#0B1417] dark:text-[#E3EEF0]">
      <aside className="bg-[#15383F] text-[#F3E6D7] md:min-h-screen">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 md:flex-col md:items-stretch md:px-5 md:py-6">
          <Link to="/members" className="mr-auto md:mr-0">
            <span className="block text-xs font-semibold tracking-widest uppercase opacity-80">
              Members
            </span>
            <span className="block text-xl font-semibold">{name}</span>
          </Link>
          <div className="flex items-center gap-2 md:hidden">
            <NotificationBell count={loaderData.unreadNotifications} tone="dark" />
            <ProfileMenu me={loaderData.me} tone="dark" />
          </div>
          <nav aria-label="Members" className="w-full md:mt-6">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-1">
              {sections.map((section) => (
                <li key={section.to}>
                  <NavLink
                    to={section.to}
                    end={section.end}
                    className={({ isActive }) =>
                      `block rounded px-2 py-1.5 font-medium md:px-3 ${
                        // All members and profiles open from Community, so it stays highlighted there.
                        isActive || (section.to === "/members/community" && /^\/members\/people(\/|$)/.test(pathname)) ?"bg-[#F3E6D7] text-[#15383F]" : "hover:bg-white/10"
                      }`
                    }
                  >
                    {section.label}
                    {section.to === "/members/updates" && <UnseenCount count={loaderData.unseenUpdates} />}
                  </NavLink>
                </li>
              ))}
              {loaderData.isAdmin && (
                <li className="md:mt-3">
                  <Link
                    to="/admin"
                    className="block rounded border border-[#F3E6D7]/60 px-2 py-1.5 font-semibold hover:bg-white/10 md:px-3"
                  >
                    Admin
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/15 pt-4 text-sm md:mt-8 md:flex-col md:items-start">
            {loaderData.email && (
              <span className="opacity-80">
                {loaderData.email}
                {loaderData.roleNames.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {loaderData.roleNames.map((name) => (
                      <span key={name} className="rounded-full bg-[#F3E6D7] px-2 py-0.5 text-xs font-semibold text-[#15383F]">{name}</span>
                    ))}
                  </span>
                )}
              </span>
            )}
            <Link to="/" className="underline">
              Public website
            </Link>
            <Form method="post" action="/sign-out">
              <button type="submit" className="underline">
                Sign out
              </button>
            </Form>
          </div>
        </div>
      </aside>
      {/* One content width for every page, so each page's right edge lines up with the others'. */}
      <main className="min-w-0 px-4 py-8 md:px-10 md:pt-4 md:pb-10">
        <div className="max-w-5xl">
          <div className="mb-2 hidden items-center justify-end gap-3 md:flex">
            <NotificationBell count={loaderData.unreadNotifications} />
            <ProfileMenu me={loaderData.me} />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
