import { useRef } from "react";
import { Link, NavLink, Outlet } from "react-router";

import { MembersMessage } from "~/components/members-message";
import { servicesContext } from "~/context";
import type { Route } from "./+types/layout";

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const membership = await services.membership();
  return { signedIn: services.viewer !== null, membership };
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  const { signedIn, membership } = loaderData;
  return (
    <>
      <header className="border-b border-gray-200 dark:border-gray-800">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4"
        >
          <Link to="/" className="mr-auto text-xl font-semibold">
            Limicon
          </Link>
          <MembersLink membership={membership} />
          <NavLink to={signedIn ? "/account" : "/sign-in"} className="font-medium">
            {signedIn ? "Your account" : "Sign in"}
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </>
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
