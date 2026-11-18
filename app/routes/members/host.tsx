import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect } from "react-router";

import { HostGuidelines } from "~/content/host-guidelines";
import { servicesContext } from "~/context";
import { acceptGuidelines, hasAcceptedGuidelines, listHostedSessions } from "~/lib/sessions.server";
import type { Route } from "./+types/host";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Host a session · Members · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const userId = services.viewer!.userId;
  if (!edition) return { year: null, accepted: false, sessions: [] };
  const accepted = await hasAcceptedGuidelines(services.db(), userId, edition.id);
  return {
    year: edition.year,
    accepted,
    sessions: accepted ? await listHostedSessions(services.db(), userId, edition.id) : [],
  };
}

export async function action({ context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (edition) await acceptGuidelines(services.db(), services.viewer!.userId, edition.id);
  throw redirect("/members/host/new");
}

export default function Host({ loaderData }: Route.ComponentProps) {
  if (!loaderData.accepted) return <AcceptGuidelines year={loaderData.year} />;
  return <YourSessions sessions={loaderData.sessions} />;
}

/** The guidelines, with an Accept button that unlocks once the member has scrolled to the end. */
function AcceptGuidelines({ year }: { year: number | null }) {
  const end = useRef<HTMLDivElement>(null);
  // Enabled in the server-rendered page, so it works without JavaScript; with it, waits for the end.
  const [reachedEnd, setReachedEnd] = useState(true);
  useEffect(() => {
    const target = end.current;
    if (!target) return;
    setReachedEnd(false);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setReachedEnd(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <h1 className="text-3xl font-semibold">Host a session</h1>
      <p className="mt-3 max-w-[68ch]">
        Every member can host sessions throughout Limicon. Before your first session
        {year ? ` of Limicon ${year}` : ""}, please read the host guidelines to the end and accept them.
      </p>
      <div className="mt-6 max-h-[60vh] overflow-y-auto rounded-lg border border-[#C9DADC] bg-white p-6 dark:border-[#24363B] dark:bg-[#12201F]">
        <HostGuidelines year={year} />
        <div ref={end} aria-hidden="true" className="h-px" />
      </div>
      <Form method="post" className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!reachedEnd}
          className="rounded bg-[#15383F] px-5 py-2.5 font-semibold text-[#F3E6D7] disabled:opacity-50 dark:bg-[#F3E6D7] dark:text-[#15383F]"
        >
          I've read the guidelines and accept them
        </button>
        {!reachedEnd && <span className="text-sm">Scroll to the end of the guidelines to continue.</span>}
      </Form>
    </>
  );
}

function YourSessions({ sessions }: { sessions: Route.ComponentProps["loaderData"]["sessions"] }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Host a session</h1>
        <Link
          to="/members/host/new"
          className="rounded bg-[#15383F] px-5 py-2.5 font-semibold text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]"
        >
          Host a new session
        </Link>
      </div>
      <h2 className="mt-8 text-xl font-semibold">Your sessions</h2>
      {sessions.length === 0 ? (
        <p className="mt-3">You haven't created a session yet.</p>
      ) : (
        <ul className="mt-4 grid max-w-3xl gap-3">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                to={`/members/host/${session.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#C9DADC] bg-white p-4 hover:border-[#15383F] dark:border-[#24363B] dark:bg-[#12201F] dark:hover:border-[#8CC7D3]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{session.title}</span>
                  <span className="block text-sm">
                    {session.startsAt ? sessionTime(session.startsAt, session.endsAt!, session.timeZone) : "No date yet"}
                    {session.role === "co-host" ? " · Co-host" : ""}
                  </span>
                </span>
                <span
                  className={`rounded-full px-3 py-0.5 text-sm font-semibold ${
                    session.published ? "bg-[#CDEBE3] text-[#0F4A3C]" : "bg-[#F9DCBD] text-[#5A3612]"
                  }`}
                >
                  {session.published ? "On the calendar" : "Draft"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm">
        <Link to="/members/host/guidelines" className="underline">
          Read the host guidelines again
        </Link>
      </p>
    </>
  );
}

/** A session's time in the zone its host chose, such as "Wed, Mar 17, 12:00 PM – 1:00 PM EDT". */
function sessionTime(start: Date, end: Date, timeZone: string) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return format.formatRange(new Date(start), new Date(end));
}
