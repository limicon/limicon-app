import { Link } from "react-router";

import type { MembershipStatus } from "~/lib/membership";

/**
 * Why the Members area is closed to this viewer, and what to do about it. Shown in the menu's
 * pop-up and on the page that members-only addresses send visitors to.
 */
export function MembersMessage({
  status,
  editionYear,
  headingId,
}: {
  status: Exclude<MembershipStatus, "member">;
  editionYear: number | null;
  headingId?: string;
}) {
  const ticket = editionYear ? `a Limicon ${editionYear} ticket` : "a Limicon ticket";
  if (status === "deactivated") {
    return (
      <div className="grid gap-4">
        <h2 id={headingId} className="text-2xl font-semibold">
          This account is deactivated
        </h2>
        <p>
          The Organizing Team has deactivated this account, so it can't open the Members area. If you think this is
          a mistake, email <a href="mailto:team@limicon.org" className="underline">team@limicon.org</a>.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <h2 id={headingId} className="text-2xl font-semibold">
        The Members area is for ticket holders
      </h2>
      <p>
        You need {ticket} to open the Members area, where you'll find the schedule, hosting a
        session, updates and the community.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/tickets"
          className="rounded bg-gray-900 px-4 py-2 font-medium text-white dark:bg-gray-100 dark:text-gray-900"
        >
          Get a ticket
        </Link>
        {status === "signed-out" && (
          <Link to="/sign-in" className="underline">
            Already have a ticket? Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
