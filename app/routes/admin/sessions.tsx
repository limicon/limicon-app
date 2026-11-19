import { data, Form, Link, redirect, useNavigation } from "react-router";

import { Badge, card, Notice, PageHeading, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { isUuid, listAllSessions, setCocreationMeeting, unpublishSession, type AdminSession } from "~/lib/admin.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/sessions";

/** Admins only (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("admin")];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sessions · Admin · Limicon" }];
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "published", label: "On the calendar" },
  { value: "drafts", label: "Drafts" },
  { value: "cocreation", label: "Co-creation meetings" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

function matches(session: AdminSession, filter: Filter) {
  if (filter === "published") return session.published;
  if (filter === "drafts") return !session.published;
  if (filter === "cocreation") return session.isCocreationMeeting;
  return true;
}

async function currentEdition(context: Route.LoaderArgs["context"]) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  return { services, edition };
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const { services, edition } = await currentEdition(context);
  const query = new URL(request.url).searchParams;
  const show = (FILTERS.find((f) => f.value === query.get("show"))?.value ?? "all") as Filter;
  const sessions = await listAllSessions(services.db(), edition.id);
  return {
    year: edition.year,
    show,
    counts: Object.fromEntries(FILTERS.map((f) => [f.value, sessions.filter((s) => matches(s, f.value)).length])) as Record<Filter, number>,
    sessions: sessions.filter((s) => matches(s, show)),
    done: query.get("done") ?? (query.get("deleted") ? "deleted" : null),
  };
}

/** Admins can take any session off the calendar (SES-4) and mark co-creation meetings (SES-9). */
export async function action({ request, context }: Route.ActionArgs) {
  const { services, edition } = await currentEdition(context);
  const form = await request.formData();
  const sessionId = form.get("sessionId");
  if (!isUuid(sessionId)) throw data("Session not found", { status: 404 });
  const back = new URL(request.url).searchParams.get("show") ?? "all";
  const intent = form.get("intent");
  if (intent === "unpublish") {
    await unpublishSession(services.db(), edition.id, sessionId);
    throw redirect(`/admin/sessions?show=${back}&done=unpublished`);
  }
  if (intent === "cocreation-on" || intent === "cocreation-off") {
    await setCocreationMeeting(services.db(), edition.id, sessionId, intent === "cocreation-on");
    throw redirect(`/admin/sessions?show=${back}&done=${intent}`);
  }
  throw data("Unknown action", { status: 400 });
}

const doneMessages: Record<string, string> = {
  deleted: "Session deleted.",
  unpublished: "Taken off the calendar. Its hosts still have it as a draft.",
  "cocreation-on": "Marked as an Organizing Team co-creation meeting.",
  "cocreation-off": "No longer marked as a co-creation meeting.",
};

export default function AdminSessions({ loaderData }: Route.ComponentProps) {
  const { sessions, show, counts, done, year } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <PageHeading title="Sessions">
        <p>
          Every Limicon {year} session, drafts included. Admins can edit, publish, take off the calendar or delete any
          of them.
        </p>
      </PageHeading>
      {done && doneMessages[done] && <Notice>{doneMessages[done]}</Notice>}

      <nav aria-label="Filter sessions" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            to={`?show=${filter.value}`}
            aria-current={show === filter.value ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              show === filter.value
                ? "border-[#15383F] bg-[#15383F] text-[#F3E6D7] dark:border-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]"
                : "border-[#9DB5B9] hover:border-[#15383F] dark:border-[#3A5359]"
            }`}
          >
            {filter.label} <span className="tabular-nums opacity-80">{counts[filter.value]}</span>
          </Link>
        ))}
      </nav>

      {sessions.length === 0 ? (
        <p>No sessions here yet.</p>
      ) : (
        <ul className="grid max-w-5xl gap-3">
          {sessions.map((session) => (
            <li key={session.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">
                      <Link to={`/admin/sessions/${session.id}`} className="hover:underline">{session.title}</Link>
                    </h2>
                    <Badge tone={session.published ? "green" : "amber"}>{session.published ? "On the calendar" : "Draft"}</Badge>
                    {session.isCocreationMeeting && <Badge tone="blue">Co-creation meeting</Badge>}
                  </div>
                  <p className="mt-1 text-sm">
                    {session.startsAt ? sessionTime(session.startsAt, session.endsAt!, session.timeZone) : "No date yet"}
                    {session.theme ? ` · ${session.theme}` : ""}
                  </p>
                  <p className="mt-1 text-sm opacity-80">Hosted by {session.hosts.length ? session.hosts.join(", ") : "nobody"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/sessions/${session.id}`} className={secondaryButton}>Edit</Link>
                  <Form method="post" className="contents">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button
                      type="submit"
                      name="intent"
                      value={session.isCocreationMeeting ? "cocreation-off" : "cocreation-on"}
                      disabled={busy}
                      className={secondaryButton}
                    >
                      {session.isCocreationMeeting ? "Unmark co-creation" : "Mark as co-creation"}
                    </button>
                    {session.published && (
                      <button type="submit" name="intent" value="unpublish" disabled={busy} className={secondaryButton}>
                        Take off calendar
                      </button>
                    )}
                  </Form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A session's time in the zone its host chose, such as "Wed, Mar 17, 12:00 PM – 1:00 PM EDT". */
function sessionTime(start: Date, end: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatRange(new Date(start), new Date(end));
}
