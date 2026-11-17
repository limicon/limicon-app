import { Form, Link, NavLink, Outlet } from "react-router";

import { servicesContext } from "~/context";
import { requireMembership } from "~/middleware/services.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [requireMembership];

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { editionYear } = await services.membership();
  return { editionYear, email: services.viewer?.email ?? null };
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
          <nav aria-label="Members" className="w-full md:mt-6">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-1">
              {sections.map((section) => (
                <li key={section.to}>
                  <NavLink
                    to={section.to}
                    end={section.end}
                    className={({ isActive }) =>
                      `block rounded px-2 py-1.5 font-medium md:px-3 ${
                        isActive ? "bg-[#F3E6D7] text-[#15383F]" : "hover:bg-white/10"
                      }`
                    }
                  >
                    {section.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/15 pt-4 text-sm md:mt-8 md:flex-col md:items-start">
            {loaderData.email && <span className="opacity-80">{loaderData.email}</span>}
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
      <main className="min-w-0 px-4 py-8 md:px-10 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
