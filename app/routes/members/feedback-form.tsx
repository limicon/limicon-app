import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { card, inputClass, primaryButton } from "~/components/admin-ui";
import { VoiceNoteField } from "~/components/voice-note-field";
import { servicesContext } from "~/context";
import {
  EXPERIENCE_OPTIONS,
  FEEDBACK_KINDS,
  HARVEST_QUESTIONS,
  HOST_QUESTIONS,
  isFeedbackKind,
  parseHarvest,
  parseHostFeedback,
  TENSION_OPTIONS,
  type Harvest,
  type HostFeedback,
} from "~/lib/feedback";
import { getHarvest, getHostFeedback, getOwedSession, saveHarvest, saveHostFeedback } from "~/lib/feedback.server";
import { fullTimeRange } from "~/lib/format-time";
import { getViewerZone } from "~/lib/viewer-zone.server";
import type { Route } from "./+types/feedback-form";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData ? FEEDBACK_KINDS[loaderData.kind].title : "Feedback"} · Members · Limicon` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  if (!isFeedbackKind(params.kind)) throw data("Not found", { status: 404 });
  const kind = params.kind;
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const db = services.db();
  const userId = services.viewer!.userId;
  const session = edition ? await getOwedSession(db, kind, userId, edition.id, params.sessionId) : null;
  if (!session) throw data("Not found", { status: 404 });
  const [{ zone }, host, harvest] = await Promise.all([
    getViewerZone(db, userId, request.headers.get("Cookie")),
    kind === "host" ? getHostFeedback(db, userId, session.sessionId) : Promise.resolve(null),
    kind === "harvest" ? getHarvest(db, userId, session.sessionId) : Promise.resolve(null),
  ]);
  return { kind, session, when: fullTimeRange(session.startsAt, session.endsAt, zone), host, harvest };
}

/** Saves the member's own answers for a session they owe this form for, and nobody else's. */
export async function action({ request, params, context }: Route.ActionArgs) {
  if (!isFeedbackKind(params.kind)) throw data("Not found", { status: 404 });
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("Not found", { status: 404 });
  const db = services.db();
  const userId = services.viewer!.userId;
  const form = await request.formData();

  let saved: boolean;
  if (params.kind === "host") {
    const parsed = parseHostFeedback(form);
    if (!parsed.ok) return { errors: parsed.errors };
    saved = await saveHostFeedback(db, userId, edition.id, params.sessionId, parsed.value);
  } else {
    const parsed = parseHarvest(form);
    if (!parsed.ok) return { errors: parsed.errors };
    const earlier = (await getHarvest(db, userId, params.sessionId))?.voiceNoteKey ?? null;
    const voiceNote = parsed.value.voiceNoteKey;
    // A new voice note must be one this member uploaded.
    if (voiceNote && voiceNote !== earlier) {
      const object = await services.media.head(voiceNote);
      if (object?.customMetadata?.uploadedBy !== userId) {
        return { errors: { voiceNote: "That voice note didn't upload. Record it again." } as Record<string, string> };
      }
    }
    saved = await saveHarvest(db, userId, edition.id, params.sessionId, parsed.value);
    // A replaced or removed recording isn't kept.
    if (saved && earlier && earlier !== voiceNote) await services.media.delete(earlier);
  }
  if (!saved) throw data("Not found", { status: 404 });
  throw redirect(`/members/feedback/${params.kind}?sent=1`);
}

const question = "block font-medium";
const help = "block text-sm opacity-80";
const errorText = "mt-1 block text-sm font-semibold text-[#B3261E] dark:text-[#F2B8B5]";
const required = <span aria-hidden className="text-[#B3261E] dark:text-[#F2B8B5]"> *</span>;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className={errorText}>{message}</span> : null;
}

export default function FeedbackFormPage({ loaderData, actionData }: Route.ComponentProps) {
  const { kind, session, when, host, harvest } = loaderData;
  const errors: Record<string, string> = actionData?.errors ?? {};
  const [recording, setRecording] = useState(false);
  const busy = useNavigation().state !== "idle";
  const sent = kind === "host" ? host : harvest;
  return (
    <div>
      <p className="text-sm">
        <Link to={`/members/feedback/${kind}`} className="underline">← {FEEDBACK_KINDS[kind].title}</Link>
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{FEEDBACK_KINDS[kind].title}</h1>
      <p className="mt-2">
        <span className="font-semibold">{session.title}</span>
        <span className="block text-sm opacity-80">{when}</span>
      </p>
      {sent && (
        <p className="mt-2 text-sm">You sent this form. Change any answer and send it again to update it.</p>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="mt-4 font-semibold text-[#B3261E] dark:text-[#F2B8B5]">Some answers need a look. They're marked below.</p>
      )}
      {kind === "host" && <p className="mt-4 text-sm">{required} marks a question that needs an answer.</p>}
      <Form method="post" className="mt-6 grid gap-6" noValidate>
        {kind === "host" ? <HostQuestions saved={host} errors={errors} /> : <HarvestQuestions saved={harvest} errors={errors} onBusy={setRecording} />}
        <div>
          <button type="submit" disabled={busy || recording} className={primaryButton}>
            {busy ? "Sending…" : sent ? "Update my answers" : "Send"}
          </button>
          {recording && <span className="ml-3 text-sm">Finish your voice note first.</span>}
        </div>
      </Form>
    </div>
  );
}

function CheckboxGroup({
  name,
  legend,
  helpText,
  options,
  checked,
  other,
  error,
}: {
  name: string;
  legend: string;
  helpText?: string;
  options: readonly { key: string; label: string }[];
  checked: string[];
  other: string | null;
  error?: string;
}) {
  const [otherOn, setOtherOn] = useState(other !== null);
  return (
    <fieldset className={card} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className={`${question} float-left w-full`}>{legend}{required}</legend>
      <div className="clear-left grid gap-2 pt-2">
      <span className={help}>{helpText ?? "Check all that apply."}</span>
      {options.map((option) => (
        <label key={option.key} className="flex items-start gap-3">
          <input type="checkbox" name={name} value={option.key} defaultChecked={checked.includes(option.key)} className="mt-1 size-4" />
          <span>{option.label}</span>
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3">
          <input type="checkbox" name={`${name}OtherOn`} checked={otherOn} onChange={(event) => setOtherOn(event.target.checked)} className="size-4" />
          <span>Other:</span>
        </label>
        <input
          type="text"
          name={`${name}Other`}
          aria-label={`${legend} Other`}
          defaultValue={other ?? ""}
          maxLength={500}
          onInput={(event) => setOtherOn(event.currentTarget.value.trim() !== "")}
          className={`${inputClass} max-w-sm flex-1`}
        />
      </div>
      <FieldError id={`${name}-error`} message={error} />
      </div>
    </fieldset>
  );
}

function RadioGroup({
  name,
  legend,
  helpText,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  helpText?: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange?: (value: string) => void;
  error?: string;
}) {
  return (
    <fieldset className={card} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className={`${question} float-left w-full`}>{legend}{required}</legend>
      <div className="clear-left grid gap-2 pt-2">
      {helpText && <span className={help}>{helpText}</span>}
      {options.map((option) => (
        <label key={option.value} className="flex items-start gap-3">
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={value === option.value}
            onChange={() => onChange?.(option.value)}
            className="mt-1 size-4"
          />
          <span>{option.label}</span>
        </label>
      ))}
      <FieldError id={`${name}-error`} message={error} />
      </div>
    </fieldset>
  );
}

function LongAnswer({ name, label, value, max = 10000 }: { name: string; label: string; value: string | null; max?: number }) {
  return (
    <label className={`${card} grid gap-2`}>
      <span className={question}>{label}</span>
      <textarea name={name} defaultValue={value ?? ""} rows={4} maxLength={max} className={inputClass} />
    </label>
  );
}

function HostQuestions({ saved, errors }: { saved: HostFeedback | null; errors: Record<string, string> }) {
  const [hadTensions, setHadTensions] = useState<string | null>(saved ? (saved.hadTensions ? "yes" : "no") : null);
  return (
    <>
      <label className={`${card} grid gap-2`}>
        <span className={question}>{HOST_QUESTIONS.participantCount}</span>
        <input
          type="number"
          name="participantCount"
          min={0}
          step={1}
          inputMode="numeric"
          defaultValue={saved?.participantCount ?? ""}
          aria-invalid={errors.participantCount ? true : undefined}
          aria-describedby={errors.participantCount ? "participantCount-error" : undefined}
          className={`${inputClass} max-w-[10rem]`}
        />
        <FieldError id="participantCount-error" message={errors.participantCount} />
      </label>

      <h2 className="text-xl font-semibold">Feedback</h2>
      <CheckboxGroup
        name="experience"
        legend={HOST_QUESTIONS.experience}
        options={EXPERIENCE_OPTIONS}
        checked={saved?.experience ?? []}
        other={saved?.experienceOther ?? null}
        error={errors.experience}
      />
      <LongAnswer name="howItWent" label={HOST_QUESTIONS.howItWent} value={saved?.howItWent ?? null} />
      <LongAnswer name="organizerFeedback" label={HOST_QUESTIONS.organizerFeedback} value={saved?.organizerFeedback ?? null} />
      <RadioGroup
        name="hadTensions"
        legend={HOST_QUESTIONS.hadTensions}
        helpText={HOST_QUESTIONS.hadTensionsHelp}
        options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
        value={hadTensions}
        onChange={setHadTensions}
        error={errors.hadTensions}
      />

      {hadTensions === "yes" && (
        <>
          <h2 className="text-xl font-semibold">Tension</h2>
          <CheckboxGroup
            name="tensions"
            legend={HOST_QUESTIONS.tensions}
            options={TENSION_OPTIONS}
            checked={saved?.tensions ?? []}
            other={saved?.tensionsOther ?? null}
            error={errors.tensions}
          />
          <LongAnswer name="tensionsDescription" label={HOST_QUESTIONS.tensionsDescription} value={saved?.tensionsDescription ?? null} />
          <RadioGroup
            name="wantsSupport"
            legend={HOST_QUESTIONS.wantsSupport}
            options={[{ value: "yes", label: HOST_QUESTIONS.supportYes }, { value: "no", label: HOST_QUESTIONS.supportNo }]}
            value={saved?.wantsSupport == null ? null : saved.wantsSupport ? "yes" : "no"}
            error={errors.wantsSupport}
          />
        </>
      )}
    </>
  );
}

function HarvestQuestions({ saved, errors, onBusy }: { saved: Harvest | null; errors: Record<string, string>; onBusy: (busy: boolean) => void }) {
  return (
    <>
      <VoiceNoteField
        name="voiceNote"
        label={HARVEST_QUESTIONS.voiceNote}
        help={HARVEST_QUESTIONS.voiceNoteHelp}
        initialKey={saved?.voiceNoteKey ?? null}
        error={errors.voiceNote}
        onBusy={onBusy}
      />
      <LongAnswer name="takeaway" label={HARVEST_QUESTIONS.takeaway} value={saved?.takeaway ?? null} />
      <LongAnswer name="feedBack" label={HARVEST_QUESTIONS.feedBack} value={saved?.feedBack ?? null} />
      <LongAnswer name="attractedRepelled" label={HARVEST_QUESTIONS.attractedRepelled} value={saved?.attractedRepelled ?? null} />
      <label className={`${card} grid gap-2`}>
        <span className={question}>{HARVEST_QUESTIONS.oneWord}</span>
        <input type="text" name="oneWord" defaultValue={saved?.oneWord ?? ""} maxLength={60} className={`${inputClass} max-w-sm`} />
      </label>
    </>
  );
}
