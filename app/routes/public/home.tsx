import { SitePage } from "~/components/site-page";
import { servicesContext } from "~/context";
import { loadSitePage, savePageAction } from "~/lib/page-route.server";
import type { Route } from "./+types/home";

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.event?.name ?? "Limicon";
  return [
    { title: name },
    { name: "description", content: loaderData?.event?.teaser ?? "Limicon, an open-space convention around the spring equinox." },
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  return loadSitePage(context.get(servicesContext), request, "home");
}

export async function action({ context, request }: Route.ActionArgs) {
  return savePageAction(request, context.get(servicesContext), "home");
}

/** The front page, built from sections admins arrange; it starts with the event. */
export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  return <SitePage {...loaderData} errors={actionData?.errors} />;
}
