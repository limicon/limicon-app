import { Link } from "react-router";

import { EventWhen } from "~/components/event-when";
import { RichText } from "~/components/rich-text";
import { servicesContext } from "~/context";
import { getEventDetails } from "~/lib/event.server";
import { mediaUrl } from "~/lib/media";
import type { Route } from "./+types/home";

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.event?.name ?? "Limicon";
  return [
    { title: name },
    { name: "description", content: loaderData?.event?.teaser ?? "Limicon, an open-space convention around the spring equinox." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const event = edition ? await getEventDetails(services.db(), edition.id) : null;
  return { signedIn: services.viewer !== null, event };
}

/** The front page: the current event as admins describe it on the console's Edit page. */
export default function Home({ loaderData }: Route.ComponentProps) {
  const { event, signedIn } = loaderData;
  return (
    <main className="mx-auto max-w-3xl px-4 pt-12 pb-16">
      {event?.imageKey && (
        <img src={mediaUrl(event.imageKey)} alt="" className="mb-8 aspect-[16/9] w-full rounded-lg object-cover" />
      )}
      <h1 className="text-4xl font-semibold">{event?.name ?? "Limicon"}</h1>
      <p className="mt-3 text-lg">{event?.teaser ?? "An open-space convention around the spring equinox."}</p>
      {event?.startsAt && event.startTimeZone && (
        <EventWhen startsAt={event.startsAt} endsAt={event.endsAt} zone={event.startTimeZone} className="mt-3 font-medium" />
      )}
      <p className="mt-6 flex flex-wrap gap-4">
        <Link className="rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7]" to="/tickets">
          Register
        </Link>
        {!signedIn && (
          <Link className="self-center underline" to="/sign-in">
            Sign in or create an account
          </Link>
        )}
      </p>
      {event?.about && (
        <section aria-label="About" className="mt-10">
          <RichText doc={event.about} />
        </section>
      )}
    </main>
  );
}
