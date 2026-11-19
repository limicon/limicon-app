import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { card, dangerButton, FieldError, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { ImageUploadField } from "~/components/image-upload-field";
import { RegistrationFields } from "~/components/registration-fields";
import { RichTextEditor } from "~/components/rich-text-editor";
import { servicesContext } from "~/context";
import {
  checkEmailField,
  checkEventForm,
  checkLinksForm,
  checkTierForm,
  EVENT_NAME_MAX,
  formatDollars,
  LINK_LABEL_MAX,
  LINKS_MAX,
  readSwitchesForm,
  TEASER_MAX,
  TIER_NAME_MAX,
  type EventInput,
  type LinkErrors,
  type MemberLink,
  type TierInput,
} from "~/lib/admin-forms";
import {
  addTier,
  deleteTier,
  getEditionSettings,
  issueCompTicket,
  listMemberLinks,
  listTiers,
  saveMemberLinks,
  updateEditionSettings,
  updateTier,
} from "~/lib/admin.server";
import { getEventDetails, saveEventDetails } from "~/lib/event.server";
import { MEDIA_KEY } from "~/lib/media";
import { blankRegistration } from "~/lib/registration-form";
import { getRegistrationFields } from "~/lib/registration.server";
import { readRichText, type RichDoc } from "~/lib/rich-text";
import { instantToZoned, isValidTimeZone, timeZoneNames, zonedToInstant } from "~/lib/zoned-time";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/settings";

/** Needs the `settings` privilege (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("settings")];

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
  const [event, settings, links, tiers, fields] = await Promise.all([
    getEventDetails(db, edition.id),
    getEditionSettings(db, edition.id),
    listMemberLinks(db, edition.id),
    listTiers(db, edition.id),
    getRegistrationFields(db, edition.id),
  ]);
  const zoned = (at: Date | null, zone: string | null) => (at && zone ? instantToZoned(at, zone) : { date: "", time: "" });
  const start = zoned(event.startsAt, event.startTimeZone);
  const end = zoned(event.endsAt, event.endTimeZone);
  const eventInput: EventInput = {
    name: event.name ?? `Limicon ${edition.year}`,
    teaser: event.teaser ?? "",
    startDate: start.date,
    startTime: start.time,
    startTimeZone: event.startTimeZone ?? "",
    endDate: end.date,
    endTime: end.time,
    endTimeZone: event.endTimeZone ?? "",
    imageKey: event.imageKey ?? "",
    about: "",
  };
  return {
    year: edition.year,
    eventInput,
    about: event.about,
    timeZones: timeZoneNames(),
    settings,
    links,
    tiers,
    fields,
    saved: new URL(request.url).searchParams.get("saved"),
  };
}

type ActionData =
  | { form: "event"; input: EventInput; about: RichDoc | null; errors: Partial<Record<keyof EventInput, string>> }
  | { form: "links"; input: MemberLink[]; errors: LinkErrors; message?: string }
  | { form: "tier"; tierId: number | null; input: TierInput; errors: Partial<Record<keyof TierInput, string>> }
  | { form: "comp"; input: string; error: string }
  | { form: "problem"; message: string };

const compProblems = {
  "no-account": "No account uses that email yet. Ask them to sign in once on the website, then try again.",
  "has-ticket": "They already have a ticket for this edition.",
  "bad-tier": "Choose one of this edition's tiers.",
} as const;

export async function action({ request, context }: Route.ActionArgs) {
  const { services, edition } = await currentEdition(context);
  const db = services.db();
  const form = await request.formData();
  const intent = form.get("intent");
  const tierId = Number(form.get("tierId"));

  if (intent === "event") {
    const result = checkEventForm(form, {
      toInstant: zonedToInstant,
      isZone: isValidTimeZone,
      isImageKey: (key) => MEDIA_KEY.test(key),
      cleanAbout: readRichText,
    });
    if (!result.ok) {
      return data<ActionData>({ form: "event", input: result.input, about: readRichText(result.input.about), errors: result.errors }, { status: 400 });
    }
    const replaced = await saveEventDetails(db, edition.id, result.values);
    // The old image is no longer shown anywhere once the new one is saved.
    if (replaced) await services.media.delete(replaced);
    throw redirect("/admin/settings?saved=event");
  }

  if (intent === "comp") {
    const email = checkEmailField(form);
    if (!email.ok) return data<ActionData>({ form: "comp", input: email.input, error: email.error }, { status: 400 });
    const tierValue = Number(form.get("tierId"));
    const outcome = await issueCompTicket(db, { editionId: edition.id, email: email.email, tierId: Number.isInteger(tierValue) && tierValue > 0 ? tierValue : null });
    if (outcome !== "issued") return data<ActionData>({ form: "comp", input: email.email, error: compProblems[outcome] }, { status: 409 });
    throw redirect("/admin/settings?saved=comp#tickets");
  }

  if (intent === "settings") {
    await updateEditionSettings(db, edition.id, readSwitchesForm(form));
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
  event: "Event saved. The home page shows the changes now.",
  comp: "Comp ticket issued. They can open the Members area now.",
  form: "Registration form saved. Registrants see the new form now.",
  settings: "Switches saved.",
  links: "Links saved.",
  "tier-added": "Tier added.",
  "tier-saved": "Tier saved.",
  "tier-deleted": "Tier removed.",
};

export default function AdminSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, links, tiers, fields, year, saved } = loaderData;
  const busy = useNavigation().state !== "idle";

  return (
    <>
      <PageHeading title="Settings">
        <p>Limicon {year}: the event as the public sees it, tickets and the registration form, ticket tiers, the registration and calendar switches, and member links.</p>
      </PageHeading>
      {saved && savedMessages[saved] && !actionData && <Notice>{savedMessages[saved]}</Notice>}
      {actionData?.form === "problem" && <Notice tone="problem">{actionData.message}</Notice>}

      <EventForm
        initial={actionData?.form === "event" ? actionData.input : loaderData.eventInput}
        about={actionData?.form === "event" ? actionData.about : loaderData.about}
        errors={actionData?.form === "event" ? actionData.errors : {}}
        timeZones={loaderData.timeZones}
        busy={busy}
      />

      <section id="tickets" aria-labelledby="tickets-heading" className="mt-10 max-w-3xl scroll-mt-4">
        <h2 id="tickets-heading" className="text-xl font-semibold">Tickets</h2>

        <Form method="post" className={`${card} mt-4 grid gap-3`} key={actionData?.form === "comp" ? actionData.input : "comp"}>
          <h3 className="text-lg font-semibold">Issue a comp ticket</h3>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
            <div>
              <label htmlFor="comp-email" className="block text-sm font-medium">Their email</label>
              <input
                id="comp-email"
                name="email"
                type="email"
                autoComplete="off"
                defaultValue={actionData?.form === "comp" ? actionData.input : ""}
                className={`${inputClass} mt-1`}
                {...(actionData?.form === "comp" ? { "aria-invalid": true, "aria-describedby": "comp-email-error" } : {})}
              />
            </div>
            <div>
              <label htmlFor="comp-tier" className="block text-sm font-medium">Tier</label>
              <select id="comp-tier" name="tierId" defaultValue="" className={`${inputClass} mt-1`}>
                <option value="">No tier</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" name="intent" value="comp" disabled={busy} className={primaryButton}>Issue ticket</button>
          </div>
          <FieldError id="comp-email-error" message={actionData?.form === "comp" ? actionData.error : undefined} />
          <p className="text-sm opacity-80">
            The person needs an account first: anyone can make one by signing in once. Remove a comp from the person's page under Users.
          </p>
        </Form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">What registrants see</h3>
            <p className="text-sm opacity-80">The registration form on the tickets page, before choosing a ticket. This preview can't be filled in.</p>
          </div>
          <Link to="/admin/settings/form" className={primaryButton}>Edit</Link>
        </div>
        <div className="mt-4 grid gap-6 rounded-lg border-2 border-dashed border-[#C9DADC] bg-[#F4F7F7] p-4 dark:border-[#24363B] dark:bg-[#0B1417]" aria-label="Preview of the registration form">
          <p className="text-2xl font-semibold">Register for Limicon {year}</p>
          <RegistrationFields fields={fields} input={blankRegistration(fields)} email={null} preview />
        </div>
      </section>

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

      <Form method="post" className={`${card} mt-10 grid max-w-3xl gap-4`} key={JSON.stringify(settings)}>
        <input type="hidden" name="intent" value="settings" />
        <h2 className="text-lg font-semibold">Switches</h2>
        <Switch
          name="registrationOpen"
          label="Registration is open"
          help="When it's closed, the tickets page says so instead of registering people (REG-10)."
          defaultChecked={settings.registrationOpen}
        />
        <Switch
          name="calendarOpen"
          label="The calendar is on"
          help="Recorded now. The schedule and Host a session pages don't act on it yet (CAL-9)."
          defaultChecked={settings.calendarOpen}
        />
        <div>
          <button type="submit" disabled={busy} className={primaryButton}>Save switches</button>
        </div>
      </Form>

      <LinksForm
        key={JSON.stringify(links)}
        initial={actionData?.form === "links" ? actionData.input : links}
        errors={actionData?.form === "links" ? actionData.errors : {}}
        message={actionData?.form === "links" ? actionData.message : undefined}
        busy={busy}
      />
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

/**
 * The event's public details: name, teaser, start and end with their zones, image and About.
 * Cancel puts back what was last saved.
 */
function EventForm({
  initial,
  about,
  errors,
  timeZones,
  busy,
}: {
  initial: EventInput;
  about: RichDoc | null;
  errors: Partial<Record<keyof EventInput, string>>;
  timeZones: string[];
  busy: boolean;
}) {
  // Bumping the version remounts the form, discarding unsaved edits.
  const [version, setVersion] = useState(0);
  const [browserZone, setBrowserZone] = useState("");
  useEffect(() => setBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""), []);
  const err = (name: keyof EventInput) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});
  const whenProps = { initial, errors, timeZones, browserZone };

  return (
    <Form method="post" className={`${card} grid max-w-3xl gap-6`} key={`${version}-${JSON.stringify(initial)}`}>
      <input type="hidden" name="intent" value="event" />
      <h2 className="text-lg font-semibold">The event</h2>
      <div>
        <label htmlFor="name" className="block font-medium">Name</label>
        <input id="name" name="name" maxLength={EVENT_NAME_MAX} defaultValue={initial.name} className={`${inputClass} mt-1`} {...err("name")} />
        <FieldError id="name-error" message={errors.name} />
      </div>
      <div>
        <label htmlFor="teaser" className="block font-medium">Teaser</label>
        <p className="text-sm opacity-80">One line under the name, such as what it is and when.</p>
        <input id="teaser" name="teaser" maxLength={TEASER_MAX} defaultValue={initial.teaser} className={`${inputClass} mt-1`} {...err("teaser")} />
        <FieldError id="teaser-error" message={errors.teaser} />
      </div>
      <WhenFields which="start" legend="Starts" {...whenProps} />
      <WhenFields which="end" legend="Ends" {...whenProps} />
      <p className="-mt-3 text-sm opacity-80">
        Visitors see these times in their own time zone. Hosts can publish sessions on the days from the start to the end.
      </p>
      <div>
        <p className="font-medium">Event image</p>
        <div className="mt-2">
          <ImageUploadField name="imageKey" initialKey={initial.imageKey || null} label="The event image" />
        </div>
        <FieldError id="imageKey-error" message={errors.imageKey} />
      </div>
      <div>
        <p id="about-label" className="font-medium">About</p>
        <div className="mt-2">
          <RichTextEditor name="about" initial={about} label="About the event" />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-[#E2E8E9] pt-4 dark:border-[#24363B]">
        <button type="submit" disabled={busy} className={primaryButton}>Save</button>
        <button type="button" disabled={busy} onClick={() => setVersion((v) => v + 1)} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </Form>
  );
}

/** A date, time and zone for the event's start or end. The zone starts as the browser's. */
function WhenFields({
  which,
  legend,
  initial,
  errors,
  timeZones,
  browserZone,
}: {
  which: "start" | "end";
  legend: string;
  initial: EventInput;
  errors: Partial<Record<keyof EventInput, string>>;
  timeZones: string[];
  browserZone: string;
}) {
  const err = (name: keyof EventInput) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});
  const zoneDefault = (zone: string) => zone || (timeZones.includes(browserZone) ? browserZone : "");
  return (
    <fieldset className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr]">
      <legend className="mb-1 font-medium">{legend}</legend>
      <div>
        <label htmlFor={`${which}Date`} className="block text-sm">Date</label>
        <input id={`${which}Date`} name={`${which}Date`} type="date" defaultValue={initial[`${which}Date`]} className={`${inputClass} mt-1`} {...err(`${which}Date`)} />
      </div>
      <div>
        <label htmlFor={`${which}Time`} className="block text-sm">Time</label>
        <input id={`${which}Time`} name={`${which}Time`} type="time" defaultValue={initial[`${which}Time`]} className={`${inputClass} mt-1`} {...err(`${which}Time`)} />
      </div>
      <div>
        <label htmlFor={`${which}TimeZone`} className="block text-sm">Time zone</label>
        <select
          key={browserZone}
          id={`${which}TimeZone`}
          name={`${which}TimeZone`}
          defaultValue={zoneDefault(initial[`${which}TimeZone`])}
          className={`${inputClass} mt-1`}
          {...err(`${which}TimeZone`)}
        >
          <option value="">Choose a time zone</option>
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-3">
        <FieldError id={`${which}Date-error`} message={errors[`${which}Date`]} />
        <FieldError id={`${which}Time-error`} message={errors[`${which}Time`]} />
        <FieldError id={`${which}TimeZone-error`} message={errors[`${which}TimeZone`]} />
      </div>
    </fieldset>
  );
}
