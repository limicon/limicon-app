import { data, Form, redirect, useNavigation } from "react-router";

import { Badge, card, dangerButton, FieldError, formatWhen, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { checkEmailField, formatDollars } from "~/lib/admin-forms";
import { issueCompTicket, listTickets, listTiers, removeCompTicket } from "~/lib/admin.server";
import type { Route } from "./+types/tickets";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Tickets · Admin · Limicon" }];
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
  const search = (query.get("q") ?? "").slice(0, 100);
  const db = services.db();
  const [tickets, tiers] = await Promise.all([listTickets(db, edition.id, search), listTiers(db, edition.id)]);
  return { year: edition.year, search, tickets, tiers: tiers.map(({ id, name }) => ({ id, name })), done: query.get("done") };
}

const compProblems = {
  "no-account": "No account uses that email yet. Ask them to sign in once on the website, then try again.",
  "has-ticket": "They already have a ticket for this edition.",
  "bad-tier": "Choose one of this edition's tiers.",
} as const;

/** Admins issue comp tickets (REG-9) and take them back. Paid tickets are refunded through Stripe (REG-8). */
export async function action({ request, context }: Route.ActionArgs) {
  const { services, edition } = await currentEdition(context);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "comp") {
    const email = checkEmailField(form);
    if (!email.ok) return data({ input: email.input, error: email.error }, { status: 400 });
    const tierValue = form.get("tierId");
    const tierId = tierValue ? Number(tierValue) : null;
    const outcome = await issueCompTicket(services.db(), {
      editionId: edition.id,
      email: email.email,
      tierId: Number.isInteger(tierId) ? tierId : null,
    });
    if (outcome !== "issued") return data({ input: email.email, error: compProblems[outcome] }, { status: 409 });
    throw redirect("/admin/tickets?done=comp");
  }

  if (intent === "remove-comp") {
    await removeCompTicket(services.db(), edition.id, Number(form.get("ticketId")));
    throw redirect("/admin/tickets?done=removed");
  }

  throw data("Unknown action", { status: 400 });
}

const doneMessages: Record<string, string> = {
  comp: "Comp ticket issued. They can open the Members area now.",
  removed: "Comp ticket removed.",
};

const statusBadge = {
  paid: { tone: "green", label: "Paid" },
  comp: { tone: "blue", label: "Comp" },
  refunded: { tone: "gray", label: "Refunded" },
} as const;

export default function AdminTickets({ loaderData, actionData }: Route.ComponentProps) {
  const { tickets, tiers, search, done, year } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <PageHeading title="Tickets">
        <p>Everyone registered for Limicon {year}, newest first.</p>
      </PageHeading>
      {done && doneMessages[done] && !actionData && <Notice>{doneMessages[done]}</Notice>}

      <Form method="post" className={`${card} mb-8 grid max-w-3xl gap-3`}>
        <h2 className="text-lg font-semibold">Issue a comp ticket</h2>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">Their email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="off"
              defaultValue={actionData?.input ?? ""}
              className={`${inputClass} mt-1`}
              {...(actionData?.error ? { "aria-invalid": true, "aria-describedby": "email-error" } : {})}
            />
          </div>
          <div>
            <label htmlFor="tierId" className="block text-sm font-medium">Tier</label>
            <select id="tierId" name="tierId" className={`${inputClass} mt-1`} defaultValue="">
              <option value="">No tier</option>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>{tier.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" name="intent" value="comp" disabled={busy} className={primaryButton}>Issue ticket</button>
        </div>
        <FieldError id="email-error" message={actionData?.error} />
        <p className="text-sm opacity-80">The person needs an account first: anyone can make one by signing in once.</p>
      </Form>

      <div className="mb-4 flex max-w-5xl flex-wrap items-end justify-between gap-3">
        <Form method="get" role="search" className="flex items-end gap-2">
          <div>
            <label htmlFor="q" className="block text-sm font-medium">Find by name or email</label>
            <input id="q" name="q" type="search" defaultValue={search} className={`${inputClass} mt-1 w-64`} />
          </div>
          <button type="submit" className={secondaryButton}>Search</button>
        </Form>
        <a href="/admin/tickets.csv" className={secondaryButton} download>Download CSV</a>
      </div>

      {tickets.length === 0 ? (
        <p>{search ? "No registrations match." : "No registrations yet."}</p>
      ) : (
        <div className="max-w-5xl overflow-x-auto rounded-lg border border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#EEF3F3] dark:bg-[#16262A]">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                <th scope="col" className="px-3 py-2 font-semibold">Tier</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Paid</th>
                <th scope="col" className="px-3 py-2 font-semibold">Registered</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-t border-[#E2E8E9] dark:border-[#24363B]">
                  <td className="px-3 py-2">{ticket.name ?? <span className="opacity-60">No name</span>}</td>
                  <td className="px-3 py-2 break-all">{ticket.email}</td>
                  <td className="px-3 py-2">{ticket.tier ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={statusBadge[ticket.status].tone}>{statusBadge[ticket.status].label}</Badge>
                    {ticket.imported && <span className="ml-1 text-xs opacity-70">imported</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDollars(ticket.amountPaidCents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatWhen(ticket.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {ticket.status === "comp" && (
                      <Form method="post">
                        <input type="hidden" name="ticketId" value={ticket.id} />
                        <button type="submit" name="intent" value="remove-comp" disabled={busy} className={dangerButton}>Remove</button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
