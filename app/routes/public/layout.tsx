import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router";

import { MembersMessage } from "~/components/members-message";
import { servicesContext } from "~/context";
import { listMenuPages } from "~/lib/site-pages.server";
import type { Route } from "./+types/layout";

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const [membership, menuPages] = await Promise.all([services.membership(), listMenuPages(services.db())]);
  return { signedIn: services.viewer !== null, membership, menuPages };
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  const { signedIn, membership, menuPages } = loaderData;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4"
        >
          <Link to="/" className="mr-auto text-xl font-semibold">
            Limicon
          </Link>
          {menuPages.map((p) => (
            <NavLink key={p.slug} to={`/${p.slug}`} className="font-medium">
              {p.label}
            </NavLink>
          ))}
          <NavLink to="/faq" className="font-medium">
            FAQ
          </NavLink>
          <MembersLink membership={membership} />
          <NavLink to={signedIn ? "/account" : "/sign-in"} className="font-medium">
            {signedIn ? "Your account" : "Sign in"}
          </NavLink>
          {membership.isAdmin && <AdminButton />}
        </nav>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter signedIn={signedIn} menuPages={menuPages} />
    </div>
  );
}

/** The way into the admin console, last in the menu and rendered only for admins. */
function AdminButton() {
  return (
    <Link
      to="/admin"
      className="rounded bg-[#2A1E14] px-3 py-1.5 text-sm font-semibold text-[#F3E6D7] hover:bg-[#3D2C1E] dark:bg-[#F3E6D7] dark:text-[#2A1E14]"
    >
      Admin
    </Link>
  );
}

/** The site map at the foot of every public page. It is the only place the policies are linked. */
function SiteFooter({ signedIn, menuPages }: { signedIn: boolean; menuPages: { slug: string; label: string }[] }) {
  const links = [
    { to: "/", label: "Home" },
    ...menuPages.map((p) => ({ to: `/${p.slug}`, label: p.label })),
    { to: "/faq", label: "FAQ" },
    { to: "/members", label: "Members" },
    signedIn ? { to: "/account", label: "Your account" } : { to: "/sign-in", label: "Sign in" },
    { to: "/privacy", label: "Privacy Policy" },
    { to: "/conduct", label: "Code of Conduct" },
  ];
  return (
    <footer className="mt-12 border-t border-gray-200 text-sm dark:border-gray-800">
      <nav aria-label="Site map" className="mx-auto max-w-5xl px-4 py-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 opacity-70">
          Questions? <a href="mailto:team@limicon.org" className="underline">team@limicon.org</a>
        </p>
      </nav>
    </footer>
  );
}

/**
 * The menu's one way into the Members area. Members go straight in; everyone else gets a pop-up
 * explaining that a ticket is needed. Without JavaScript the link still works: the Members area
 * sends them to the same message on its own page.
 */
function MembersLink({ membership }: { membership: Route.ComponentProps["loaderData"]["membership"] }) {
  const dialog = useRef<HTMLDialogElement>(null);

  if (membership.status === "member") {
    return (
      <Link to="/members" className="font-medium">
        Members
      </Link>
    );
  }

  return (
    <>
      <a
        href="/members"
        className="font-medium"
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          dialog.current?.showModal();
        }}
      >
        Members
      </a>
      <dialog
        ref={dialog}
        aria-labelledby="members-dialog-title"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg p-6 backdrop:bg-black/50 dark:bg-gray-900 dark:text-gray-100"
        onClick={(event) => {
          // A click on the backdrop lands on the dialog itself: close it.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <MembersMessage
          status={membership.status}
          editionYear={membership.edition?.year ?? null}
          headingId="members-dialog-title"
        />
        <form method="dialog" className="mt-6 text-right">
          <button type="submit" className="rounded border border-gray-400 px-4 py-2">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
