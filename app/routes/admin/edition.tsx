import { data, Form, redirect, useNavigation } from "react-router";

import { card, dangerButton, FieldError, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import {
  checkEditionForm,
  checkTierForm,
  formatDollars,
  TIER_NAME_MAX,
  type EditionInput,
  type TierInput,
} from "~/lib/admin-forms";
import { addTier, deleteTier, getEditionSettings, listTiers, updateEditionSettings, updateTier } from "~/lib/admin.server";
import type { Route } from "./+types/edition";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Edition · Admin · Limicon" }];
}

async function currentEdition(context: Route.LoaderArgs["context"]) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  return { services, edition };
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const { services, edition } = await currentEdition(context);
  const db = services.db();
  const [settings, tiers] = await Promise.all([getEditionSettings(db, edition.id), listTiers(db, edition.id)]);
  return { year: edition.year, settings, tiers, saved: new URL(request.url).searchParams.get("saved") };
}

type ActionData =
  | { form: "settings"; input: EditionInput; errors: Partial<Record<keyof EditionInput, string>> }
  | { form: "tier"; tierId: number | null; input: TierInput; errors: Partial<Record<keyof TierInput, string>> }
  | { form: "problem"; message: string };

export async function action({ request, context }: Route.ActionArgs) {
  const { services, edition } = await currentEdition(context);
  const db = services.db();
  const form = await request.formData();
  const intent = form.get("intent");
  const tierId = Number(form.get("tierId"));

  if (intent === "settings") {
    const result = checkEditionForm(form);
    if (!result.ok) return data<ActionData>({ form: "settings", input: result.input, errors: result.errors }, { status: 400 });
    await updateEditionSettings(db, edition.id, result.values);
    throw redirect("/admin/edition?saved=settings");
  }

  if (intent === "add-tier" || intent === "update-tier") {
    const id = intent === "update-tier" ? tierId : null;
    const result = checkTierForm(form);
    if (!result.ok) return data<ActionData>({ form: "tier", tierId: id, input: result.input, errors: result.errors }, { status: 400 });
    const outcome = id === null ? await addTier(db, edition.id, result.values) : await updateTier(db, edition.id, id, result.values);
    if (outcome === "duplicate") {
      return data<ActionData>(
        { form: "tier", tierId: id, input: { name: result.values.name, price: String(form.get("price")), sortOrder: String(form.get("sortOrder")) }, errors: { name: "Another tier already has this name." } },
        { status: 400 },
      );
    }
    throw redirect(`/admin/edition?saved=${id === null ? "tier-added" : "tier-saved"}`);
  }

  if (intent === "delete-tier") {
    if (!(await deleteTier(db, edition.id, tierId))) {
      return data<ActionData>({ form: "problem", message: "That tier has tickets, so it stays. You can rename it or change its price instead." }, { status: 409 });
    }
    throw redirect("/admin/edition?saved=tier-deleted");
  }

  throw data("Unknown action", { status: 400 });
}

const savedMessages: Record<string, string> = {
  settings: "Edition settings saved.",
  "tier-added": "Tier added.",
  "tier-saved": "Tier saved.",
  "tier-deleted": "Tier removed.",
};

export default function AdminEdition({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, tiers, year, saved } = loaderData;
  const busy = useNavigation().state !== "idle";
  const settingsErrors = actionData?.form === "settings" ? actionData.errors : {};
  const values: EditionInput =
    actionData?.form === "settings"
      ? actionData.input
      : {
          startsOn: settings.startsOn ?? "",
          endsOn: settings.endsOn ?? "",
          registrationOpen: settings.registrationOpen,
          calendarOpen: settings.calendarOpen,
          miroUrl: settings.miroUrl ?? "",
          castaliaUrl: settings.castaliaUrl ?? "",
        };
  const err = (name: keyof EditionInput) =>
    settingsErrors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};

  return (
    <>
      <PageHeading title={`Limicon ${year}`}>
        <p>The current edition's dates, the switches for registration and the calendar, member links and ticket tiers.</p>
      </PageHeading>
      {saved && savedMessages[saved] && !actionData && <Notice>{savedMessages[saved]}</Notice>}
      {actionData?.form === "problem" && <Notice tone="problem">{actionData.message}</Notice>}

      <Form method="post" className={`${card} grid max-w-3xl gap-6`} key={JSON.stringify(settings)}>
        <input type="hidden" name="intent" value="settings" />
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-lg font-semibold">Event dates</legend>
          <div>
            <label htmlFor="startsOn" className="block font-medium">First day</label>
            <input id="startsOn" name="startsOn" type="date" defaultValue={values.startsOn} className={`${inputClass} mt-1`} {...err("startsOn")} />
            <FieldError id="startsOn-error" message={settingsErrors.startsOn} />
          </div>
          <div>
            <label htmlFor="endsOn" className="block font-medium">Last day</label>
            <input id="endsOn" name="endsOn" type="date" defaultValue={values.endsOn} className={`${inputClass} mt-1`} {...err("endsOn")} />
            <FieldError id="endsOn-error" message={settingsErrors.endsOn} />
          </div>
          <p className="text-sm sm:col-span-2">Hosts can only publish sessions on these days.</p>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold">Switches</legend>
          <Switch
            name="registrationOpen"
            label="Registration is open"
            help="When it's closed, the tickets page says so instead of selling tickets (REG-10)."
            defaultChecked={values.registrationOpen}
          />
          <Switch
            name="calendarOpen"
            label="The calendar is on"
            help="Recorded now. The schedule and Host a session pages don't act on it yet (CAL-9)."
            defaultChecked={values.calendarOpen}
          />
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold">Member links</legend>
          <div>
            <label htmlFor="miroUrl" className="block font-medium">Miro board</label>
            <input id="miroUrl" name="miroUrl" type="url" placeholder="https://miro.com/…" defaultValue={values.miroUrl} className={`${inputClass} mt-1`} {...err("miroUrl")} />
            <FieldError id="miroUrl-error" message={settingsErrors.miroUrl} />
          </div>
          <div>
            <label htmlFor="castaliaUrl" className="block font-medium">Castalia</label>
            <input id="castaliaUrl" name="castaliaUrl" type="url" placeholder="https://…" defaultValue={values.castaliaUrl} className={`${inputClass} mt-1`} {...err("castaliaUrl")} />
            <FieldError id="castaliaUrl-error" message={settingsErrors.castaliaUrl} />
          </div>
        </fieldset>

        <div>
          <button type="submit" disabled={busy} className={primaryButton}>Save edition settings</button>
        </div>
      </Form>

      <section aria-labelledby="tiers-heading" className="mt-10 max-w-3xl">
        <h2 id="tiers-heading" className="text-xl font-semibold">Ticket tiers</h2>
        <p className="mt-1">Every tier gives the same access (REG-3). Lower order numbers show first.</p>
        <ul className="mt-4 grid gap-3">
          {tiers.map((tier) => (
            <li key={tier.id} className={card}>
              <TierForm
                tierId={tier.id}
                initial={
                  actionData?.form === "tier" && actionData.tierId === tier.id
                    ? actionData.input
                    : { name: tier.name, price: (tier.priceCents / 100).toFixed(tier.priceCents % 100 ? 2 : 0), sortOrder: String(tier.sortOrder) }
                }
                errors={actionData?.form === "tier" && actionData.tierId === tier.id ? actionData.errors : {}}
                busy={busy}
              />
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span>
                  {tier.tickets} {tier.tickets === 1 ? "ticket" : "tickets"} · {formatDollars(tier.priceCents)}
                </span>
                {tier.tickets === 0 && (
                  <Form method="post">
                    <input type="hidden" name="tierId" value={tier.id} />
                    <button type="submit" name="intent" value="delete-tier" className={dangerButton}>Remove tier</button>
                  </Form>
                )}
              </div>
            </li>
          ))}
          <li className={`${card} border-dashed`}>
            <h3 className="mb-3 font-semibold">Add a tier</h3>
            <TierForm
              tierId={null}
              initial={actionData?.form === "tier" && actionData.tierId === null ? actionData.input : { name: "", price: "", sortOrder: String(tiers.length) }}
              errors={actionData?.form === "tier" && actionData.tierId === null ? actionData.errors : {}}
              busy={busy}
            />
          </li>
        </ul>
      </section>
    </>
  );
}

function Switch({ name, label, help, defaultChecked }: { name: string; label: string; help: string; defaultChecked: boolean }) {
  return (
    <label className="flex gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4" />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm opacity-80">{help}</span>
      </span>
    </label>
  );
}

function TierForm({
  tierId,
  initial,
  errors,
  busy,
}: {
  tierId: number | null;
  initial: TierInput;
  errors: Partial<Record<keyof TierInput, string>>;
  busy: boolean;
}) {
  const key = tierId ?? "new";
  const err = (name: keyof TierInput) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-${key}-error` } : {});
  return (
    <Form method="post" className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_6rem_auto]" key={JSON.stringify(initial)}>
      {tierId !== null && <input type="hidden" name="tierId" value={tierId} />}
      <div>
        <label htmlFor={`name-${key}`} className="block text-sm font-medium">Name</label>
        <input id={`name-${key}`} name="name" maxLength={TIER_NAME_MAX} defaultValue={initial.name} className={`${inputClass} mt-1`} {...err("name")} />
        <FieldError id={`name-${key}-error`} message={errors.name} />
      </div>
      <div>
        <label htmlFor={`price-${key}`} className="block text-sm font-medium">Price (USD)</label>
        <input id={`price-${key}`} name="price" inputMode="decimal" defaultValue={initial.price} className={`${inputClass} mt-1`} {...err("price")} />
        <FieldError id={`price-${key}-error`} message={errors.price} />
      </div>
      <div>
        <label htmlFor={`sortOrder-${key}`} className="block text-sm font-medium">Order</label>
        <input id={`sortOrder-${key}`} name="sortOrder" type="number" step="1" defaultValue={initial.sortOrder} className={`${inputClass} mt-1`} {...err("sortOrder")} />
        <FieldError id={`sortOrder-${key}-error`} message={errors.sortOrder} />
      </div>
      <button type="submit" name="intent" value={tierId === null ? "add-tier" : "update-tier"} disabled={busy} className={tierId === null ? primaryButton : secondaryButton}>
        {tierId === null ? "Add tier" : "Save"}
      </button>
    </Form>
  );
}
