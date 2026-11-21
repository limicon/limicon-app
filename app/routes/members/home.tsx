import { Link, useRouteLoaderData } from "react-router";

import { UnseenCount } from "~/components/unseen-count";
import { servicesContext } from "~/context";
import { FEEDBACK_KINDS, type FeedbackKind } from "~/lib/feedback";
import { countFeedback } from "~/lib/feedback.server";
import type { loader as layoutLoader } from "./layout";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Members · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  // The Host Feedback box shows once a session the member hosted has ended, and the Harvest box once
  // any session they could harvest has. Each badge counts the forms they owe and haven't sent.
  const feedback = edition ? await countFeedback(services.db(), services.viewer!.userId, edition.id) : null;
  return { editionYear: edition?.year ?? null, feedback };
}

const feedbackText: Record<FeedbackKind, string> = {
  host: "Tell the Organizing Team how the sessions you hosted went.",
  harvest: "Share what you took away from the sessions you joined.",
};

type Area = { to: string; title: string; text: string; pending?: number };

const areas: Area[] = [
  { to: "/members/updates", title: "Updates", text: "News and announcements from the Organizing Team." },
  { to: "/members/schedule", title: "Schedule", text: "Every session on the calendar, and the ones you've joined." },
  { to: "/members/host", title: "Host a session", text: "Offer a session of your own. Anyone with a ticket can host." },
  { to: "/members/community", title: "Community", text: "Talk with other members, and find people who share your interests." },
];

export default function MembersHome({ loaderData }: Route.ComponentProps) {
  const name = loaderData.editionYear ? `Limicon ${loaderData.editionYear}` : "Limicon";
  // The Members layout counts the posts this member hasn't seen.
  const unseenUpdates = useRouteLoaderData<typeof layoutLoader>("routes/members/layout")?.unseenUpdates ?? 0;
  const feedbackAreas = (["host", "harvest"] as const)
    .filter((kind) => (loaderData.feedback?.[kind].sessions ?? 0) > 0)
    .map((kind) => ({ to: `/members/feedback/${kind}`, title: FEEDBACK_KINDS[kind].title, text: feedbackText[kind], pending: loaderData.feedback![kind].pending }));
  return (
    <>
      <h1 className="text-3xl font-semibold">Welcome to {name}</h1>
      <p className="mt-3">Everything for members is here.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {[...areas, ...feedbackAreas].map((area) => (
          <li key={area.to}>
            <Link
              to={area.to}
              className="block h-full rounded-lg border border-[#C9DADC] bg-white p-5 hover:border-[#15383F] dark:border-[#24363B] dark:bg-[#12201F] dark:hover:border-[#8CC7D3]"
            >
              <span className="block text-lg font-semibold">
                {area.title}
                {area.to === "/members/updates" && <UnseenCount count={unseenUpdates} />}
                {area.pending !== undefined && <UnseenCount count={area.pending} noun={["Form", "Forms"]} />}
              </span>
              <span className="mt-1 block">{area.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
