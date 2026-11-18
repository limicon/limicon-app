import { Link } from "react-router";

import { servicesContext } from "~/context";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Members · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { edition } = await context.get(servicesContext).membership();
  return { editionYear: edition?.year ?? null };
}

const areas = [
  { to: "/members/updates", title: "Updates", text: "News and announcements from the Organizing Team." },
  { to: "/members/schedule", title: "Schedule", text: "Every session on the calendar, and the ones you've joined." },
  { to: "/members/host", title: "Host a session", text: "Offer a session of your own. Anyone with a ticket can host." },
  { to: "/members/community", title: "Community", text: "Find other members, and talk with them." },
];

export default function MembersHome({ loaderData }: Route.ComponentProps) {
  const name = loaderData.editionYear ? `Limicon ${loaderData.editionYear}` : "Limicon";
  return (
    <>
      <h1 className="text-3xl font-semibold">Welcome to {name}</h1>
      <p className="mt-3 max-w-2xl">Everything for members is here.</p>
      <ul className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <li key={area.to}>
            <Link
              to={area.to}
              className="block h-full rounded-lg border border-[#C9DADC] bg-white p-5 hover:border-[#15383F] dark:border-[#24363B] dark:bg-[#12201F] dark:hover:border-[#8CC7D3]"
            >
              <span className="block text-lg font-semibold">{area.title}</span>
              <span className="mt-1 block">{area.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
