import { Link, redirect } from "react-router";

import { SessionEditor } from "~/components/session-editor";
import { servicesContext } from "~/context";
import { saveSessionForm } from "~/lib/session-actions.server";
import type { SessionFormInput } from "~/lib/session-form";
import { hasAcceptedGuidelines } from "~/lib/sessions.server";
import { timeZoneNames } from "~/lib/zoned-time";
import type { Route } from "./+types/host-new";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Host a new session · Members · Limicon" }];
}

/** Hosts accept the guidelines once per edition before the form opens (SES-2). */
async function requireGuidelines(context: Route.LoaderArgs["context"]) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition || !(await hasAcceptedGuidelines(services.db(), services.viewer!.userId, edition.id))) {
    throw redirect("/members/host");
  }
  return { services, edition };
}

const blank: SessionFormInput = {
  title: "", description: "", intention: "", theme: "", sessionTypes: [], experience: [],
  date: "", start: "", lengthMinutes: "60", timeZone: "America/Toronto", meetingLink: "",
  city: "", venueNote: "", maxParticipants: "", waitlist: false, recorded: "",
  recordingAudience: "", aiAllowed: "", aiPermissions: [], coHosts: [], repeat: "", repeatUntil: "", extraDates: [], extraStarts: [],
};

export async function loader({ context }: Route.LoaderArgs) {
  const { edition, services } = await requireGuidelines(context);
  return { year: edition.year, lastDay: edition.lastDay, timeZones: timeZoneNames(), hostId: services.viewer!.userId };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { services } = await requireGuidelines(context);
  return saveSessionForm(request, services, null);
}

export default function HostNew({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <>
      <p>
        <Link to="/members/host" className="underline">Back to your sessions</Link>
      </p>
      <h1 className="mt-4 mb-2 text-3xl font-semibold">Host a new session</h1>
      <p className="mb-6 max-w-[68ch]">
        Save a draft at any time, and publish it to the calendar when it's ready. You can edit it after publishing.
      </p>
      <SessionEditor
        initial={actionData?.input ?? blank}
        errors={actionData?.errors}
        status="new"
        year={loaderData.year}
        timeZones={loaderData.timeZones}
        hostId={loaderData.hostId}
        lastDay={loaderData.lastDay}
      />
    </>
  );
}
