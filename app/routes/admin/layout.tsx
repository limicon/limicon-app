import { Form, Link, NavLink, Outlet, useMatches } from "react-router";

import { servicesContext } from "~/context";
import type { Privilege } from "~/lib/admin-roles";
import { requireAdmin } from "~/middleware/services.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [requireAdmin];

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const [{ edition }, privileges] = await Promise.all([services.membership(), services.privileges()]);
  return { editionYear: edition?.year ?? null, email: services.viewer?.email ?? null, privileges: [...privileges] };
}

/** The console's pages, each with the privilege it needs (none for the Overview). */
const sections: { to: string; label: string; end?: boolean; needs?: Privilege }[] = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/settings", label: "Settings", needs: "settings" },
  { to: "/admin/users", label: "Users", needs: "admin" },
  { to: "/admin/orders", label: "Orders", needs: "orders" },
  { to: "/admin/guests", label: "Guests", needs: "admin" },
  { to: "/admin/sessions", label: "Sessions", needs: "admin" },
  { to: "/admin/website", label: "Website", needs: "website" },
  { to: "/admin/faq", label: "FAQ", needs: "website" },
  { to: "/admin/policies", label: "Policies", needs: "website" },
  { to: "/admin/team", label: "Team", needs: "admin" },
];

/** The admin console's shell (ADM-1): its own menu, apart from the public site and Members area. */
export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const name = loaderData.editionYear ? `Limicon ${loaderData.editionYear}` : "Limicon";
  // Every page shares one content width so right edges line up; a page that previews the public
  // site edge to edge opts out with `handle = { fullWidth: true }`.
  const fullWidth = useMatches().some((match) => (match.handle as { fullWidth?: boolean } | undefined)?.fullWidth);
  return (
    <div className="min-h-screen bg-[#F4F7F7] text-[#15383F] md:grid md:grid-cols-[15rem_1fr] dark:bg-[#0B1417] dark:text-[#E3EEF0]">
      <aside className="bg-[#2A1E14] text-[#F3E6D7] md:min-h-screen">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 md:flex-col md:items-stretch md:px-5 md:py-6">
          <Link to="/admin" className="mr-auto md:mr-0">
            <span className="block text-xs font-semibold tracking-widest uppercase opacity-80">Admin</span>
            <span className="block text-xl font-semibold">{name}</span>
          </Link>
          <nav aria-label="Admin" className="w-full md:mt-6">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-1">
              {sections.filter((section) => !section.needs || loaderData.privileges.includes(section.needs)).map((section) => (
                <li key={section.to}>
                  <NavLink
                    to={section.to}
                    end={section.end}
                    className={({ isActive }) =>
                      `block rounded px-2 py-1.5 font-medium md:px-3 ${
                        isActive ? "bg-[#F3E6D7] text-[#2A1E14]" : "hover:bg-white/10"
                      }`
                    }
                  >
                    {section.label}
                  </NavLink>
                </li>
              ))}
              {loaderData.privileges.includes("website") && (
              <li className="md:mt-4 md:border-t md:border-white/15 md:pt-4">
                <a
                  href="/?edit=1"
                  className="block rounded bg-[#F3E6D7] px-2 py-1.5 font-semibold text-[#2A1E14] hover:bg-white md:px-3"
                >
                  ✎ Edit website
                </a>
              </li>
              )}
            </ul>
          </nav>
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/15 pt-4 text-sm md:mt-8 md:flex-col md:items-start">
            {loaderData.email && <span className="opacity-80">{loaderData.email}</span>}
            <Link to="/members" className="underline">
              Members area
            </Link>
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
        <div className={fullWidth ? undefined : "max-w-5xl"}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
