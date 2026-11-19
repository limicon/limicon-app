import { redirect } from "react-router";

import { SitePage } from "~/components/site-page";
import { servicesContext } from "~/context";
import { loadSitePage, savePageAction } from "~/lib/page-route.server";
import type { Route } from "./+types/page";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.page ? `${loaderData.page.title} · Limicon` : "Limicon" }];
}

export async function loader({ context, request, params }: Route.LoaderArgs) {
  if (params.slug === "home") throw redirect("/");
  return loadSitePage(context.get(servicesContext), request, params.slug);
}

export async function action({ context, request, params }: Route.ActionArgs) {
  return savePageAction(request, context.get(servicesContext), params.slug);
}

/** Any page admins have added to the website, at /<its address>. */
export default function Page({ loaderData, actionData }: Route.ComponentProps) {
  return <SitePage {...loaderData} errors={actionData?.errors} />;
}
