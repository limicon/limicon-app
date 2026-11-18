import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { card, dangerButton, FieldError, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import {
  checkEditionForm,
  checkLinksForm,
  checkTierForm,
  formatDollars,
  LINK_LABEL_MAX,
  LINKS_MAX,
  TIER_NAME_MAX,
  type EditionInput,
  type LinkErrors,
  type MemberLink,
  type TierInput,
} from "~/lib/admin-forms";
import {
  addTier,
  deleteTier,
  getEditionSettings,
  listMemberLinks,
  listTiers,
  saveMemberLinks,
  updateEditionSettings,
  updateTier,
} from "~/lib/admin.server";
import type { Route } from "./+types/settings";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Settings · Admin · Limicon" }];
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
  const [settings, links, tiers] = await Promise.all([
    getEditionSettings(db, edition.id),
    listMemberLinks(db, edition.id),
    listTiers(db, edition.id),
  ]);
  return { year: edition.year, settings, links, tiers, saved: new URL(request.url).searchParams.get("saved") };
}

type ActionData =
  | { form: "settings"; input: EditionInput; errors: Partial<Record<keyof EditionInput, string>> }
  | { form: "links"; input: MemberLink[]; errors: LinkErrors; message?: string }
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
    throw redirect("/admin/settings?saved=settings");
  }

  if (intent === "links") {
    const result = checkLinksForm(form);
    if (!result.ok) {
      return data<ActionData>({ form: "links", input: result.input, errors: result.errors, message: result.message }, { status: 400 });
    }
    await saveMemberLinks(db, edition.id, result.links);
    throw redirect("/admin/settings?saved=links");
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
    throw redirect(`/admin/settings?saved=${id === null ? "tier-added" : "tier-saved"}`);
  }

  if (intent === "delete-tier") {
    if (!(await deleteTier(db, edition.id, tierId))) {
      return data<ActionData>({ form: "problem", message: "That tier has tickets, so it stays. You can rename it or change its price instead." }, { status: 409 });
    }
    throw redirect("/admin/settings?saved=tier-deleted");
  }

  throw data("Unknown action", { status: 400 });
}

const savedMessages: Record<string, string> = {
  settings: "Settings saved.",
  links: "Links saved.",
  "tier-added": "Tier added.",
  "tier-saved": "Tier saved.",
  "tier-deleted": "Tier removed.",
};

export default function AdminSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, links, tiers, year, saved } = loaderData;
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
        };
  const err = (name: keyof EditionInput) =>
    settingsErrors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};

  return (
    <>
      <PageHeading title="Settings">
        <p>Limicon {year}'s dates, the switches for registration and the calendar, the links members see, and ticket tiers.</p>
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
            help="When it's closed, the tickets page says so instead of registering people (REG-10)."
            defaultChecked={values.registrationOpen}
          />
          <Switch
            name="calendarOpen"
            label="The calendar is on"
            help="Recorded now. The schedule and Host a session pages don't act on it yet (CAL-9)."
            defaultChecked={values.calendarOpen}
          />
        </fieldset>

        <div>
          <button type="submit" disabled={busy} className={primaryButton}>Save settings</button>
        </div>
      </Form>

      <LinksForm
        key={JSON.stringify(links)}
        initial={actionData?.form === "links" ? actionData.input : links}
        errors={actionData?.form === "links" ? actionData.errors : {}}
        message={actionData?.form === "links" ? actionData.message : undefined}
        busy={busy}
      />

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

type LinkRow = MemberLink & { key: number };

/**
 * The links members see (MEM-2), such as the Miro board and Castalia. "Add new link" adds a blank
 * row; saving replaces the edition's links with the rows in order, dropping wholly blank ones.
 */
function LinksForm({ initial, errors, message, busy }: { initial: MemberLink[]; errors: LinkErrors; message?: string; busy: boolean }) {
  const [rows, setRows] = useState<LinkRow[]>(() => initial.map((link, key) => ({ ...link, key })));
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (key: number, change: Partial<MemberLink>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row!);
      return next;
    });

  return (
    <Form method="post" className={`${card} mt-10 grid max-w-3xl gap-4`} aria-labelledby="links-heading">
      <input type="hidden" name="intent" value="links" />
      <div>
        <h2 id="links-heading" className="text-lg font-semibold">Member links</h2>
        <p className="mt-1 text-sm">External links for members, such as the Miro board and Castalia, in the order they'll appear.</p>
      </div>
      {message && <p role="alert" className="font-medium text-[#B3261E] dark:text-[#F2B8B5]">{message}</p>}
      {rows.length === 0 && <p className="text-sm opacity-80">No links yet.</p>}
      <ol className="grid gap-3">
        {rows.map((row, index) => {
          const rowErrors = errors[index] ?? {};
          return (
            <li key={row.key} className="grid items-start gap-2 rounded border border-[#E2E8E9] p-3 sm:grid-cols-[12rem_1fr_auto] dark:border-[#24363B]">
              <div>
                <label htmlFor={`label-${row.key}`} className="block text-sm font-medium">Name</label>
                <input
                  id={`label-${row.key}`}
                  name="label"
                  maxLength={LINK_LABEL_MAX}
                  value={row.label}
                  onChange={(event) => update(row.key, { label: event.target.value })}
                  className={`${inputClass} mt-1`}
                  {...(rowErrors.label ? { "aria-invalid": true, "aria-describedby": `label-${row.key}-error` } : {})}
                />
                <FieldError id={`label-${row.key}-error`} message={rowErrors.label} />
              </div>
              <div>
                <label htmlFor={`url-${row.key}`} className="block text-sm font-medium">Web address</label>
                <input
                  id={`url-${row.key}`}
                  name="url"
                  type="url"
                  placeholder="https://…"
                  value={row.url}
                  onChange={(event) => update(row.key, { url: event.target.value })}
                  className={`${inputClass} mt-1`}
                  {...(rowErrors.url ? { "aria-invalid": true, "aria-describedby": `url-${row.key}-error` } : {})}
                />
                <FieldError id={`url-${row.key}-error`} message={rowErrors.url} />
              </div>
              <div className="flex gap-1 sm:mt-6">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${row.label || "link"} up`} className={`${secondaryButton} disabled:opacity-40`}>↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={`Move ${row.label || "link"} down`} className={`${secondaryButton} disabled:opacity-40`}>↓</button>
                <button type="button" onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))} className={dangerButton}>Remove</button>
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <button
          type="button"
          disabled={rows.length >= LINKS_MAX}
          onClick={() => {
            setRows((current) => [...current, { label: "", url: "", key: nextKey }]);
            setNextKey((key) => key + 1);
          }}
          className={`${secondaryButton} disabled:opacity-40`}
        >
          Add new link
        </button>
      </div>
      <div>
        <button type="submit" disabled={busy} className={primaryButton}>Save links</button>
      </div>
    </Form>
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
