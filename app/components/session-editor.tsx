import { useEffect, useState } from "react";
import { Form, useNavigation } from "react-router";

import { CoHostField } from "~/components/co-host-field";
import { RichTextEditor } from "~/components/rich-text-editor";
import {
  AI_PERMISSIONS,
  EXPERIENCE,
  LENGTH_MAX,
  LENGTH_MIN,
  RECORDING_AUDIENCES,
  REPEATS,
  SESSION_TYPES,
  THEMES,
  TITLE_MAX,
  type FieldErrors,
  type SessionFormInput,
} from "~/lib/session-form";
import { plainToRichText, type RichDoc } from "~/lib/rich-text";

export type EditorStatus = "new" | "draft" | "published";

const input =
  "w-full rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E] aria-[invalid=true]:border-[#B3261E]";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">
      {message}
    </p>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-5 rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]">
      <legend className="px-1 text-lg font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function errorProps(name: keyof SessionFormInput, errors: FieldErrors) {
  return errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};
}

/**
 * The Host a Session form, for a new session or an existing one. Draft and publish post the same
 * fields with a different `intent`; the server checks them (SES-10).
 */
export function SessionEditor({
  initial,
  errors = {},
  status,
  year,
  timeZones,
  hostId,
  lastDay = null,
}: {
  initial: SessionFormInput;
  errors?: FieldErrors;
  status: EditorStatus;
  year: number | null;
  timeZones: string[];
  /** The session's host, who can't also be a co-host. */
  hostId: string | null;
  /** The event's last day ("YYYY-MM-DD"), where weekly repeats stop unless the host says sooner. */
  lastDay?: string | null;
}) {
  const busy = useNavigation().state !== "idle";
  const [title, setTitle] = useState(initial.title);
  const [types, setTypes] = useState(initial.sessionTypes);
  const [recorded, setRecorded] = useState(initial.recorded);
  const [aiAllowed, setAiAllowed] = useState(initial.aiAllowed);
  const [maxParticipants, setMaxParticipants] = useState(initial.maxParticipants);
  const [timeZone, setTimeZone] = useState(initial.timeZone);

  // A new session starts in the host's own time zone, which only the browser knows.
  useEffect(() => {
    if (status !== "new" || errors.timeZone) return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && timeZones.includes(browserZone)) setTimeZone(browserZone);
    // Only once, when the form first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inPerson = types.includes("in_person");
  const members = year ? `Limicon ${year} members` : "Limicon members";
  const titleLength = [...title].length;

  return (
    <Form method="post" className="grid max-w-3xl gap-6" noValidate>
      <Fieldset legend="About the session">
        <div>
          <label htmlFor="title" className="block font-medium">Session title</label>
          <input
            id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX} required className={`mt-1 ${input}`} {...errorProps("title", errors)}
          />
          <p className="mt-1 text-sm" aria-live="polite">{titleLength} of {TITLE_MAX} characters</p>
          <FieldError id="title-error" message={errors.title} />
        </div>
        <div>
          <p className="block font-medium">About this session</p>
          <p id="description-help" className="text-sm">
            What should participants expect? Use the toolbar for bold, italics, underline, lists and links to materials and references.
          </p>
          <div className="mt-1">
            <RichTextEditor name="description" initial={editorStart(initial.description)} label="About this session" describedBy="description-help" basic />
          </div>
          <FieldError id="description-error" message={errors.description} />
        </div>
        <div>
          <label htmlFor="intention" className="block font-medium">Intention <span className="font-normal">(optional)</span></label>
          <p id="intention-help" className="text-sm">The purpose of the session, or what you hope people take away.</p>
          <textarea id="intention" name="intention" defaultValue={initial.intention} rows={3} aria-describedby="intention-help" className={`mt-1 ${input}`} />
        </div>
        <div>
          <label htmlFor="theme" className="block font-medium">Theme</label>
          <select id="theme" name="theme" defaultValue={initial.theme} className={`mt-1 ${input}`} {...errorProps("theme", errors)}>
            <option value="">Choose a theme</option>
            {THEMES.map((theme) => <option key={theme}>{theme}</option>)}
          </select>
          <FieldError id="theme-error" message={errors.theme} />
        </div>
        <fieldset {...errorProps("sessionTypes", errors)}>
          <legend className="font-medium">Session type <span className="font-normal">(choose one or more)</span></legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {SESSION_TYPES.map((type) => (
              <label key={type.value} className="flex gap-3 rounded border border-[#DCE6E7] p-3 dark:border-[#24363B]">
                <input
                  type="checkbox" name="sessionTypes" value={type.value} checked={types.includes(type.value)}
                  onChange={(e) => setTypes(e.target.checked ? [...types, type.value] : types.filter((t) => t !== type.value))}
                  className="mt-1 size-4 shrink-0"
                />
                <span><span className="block font-medium">{type.label}</span><span className="block text-sm">{type.help}</span></span>
              </label>
            ))}
          </div>
          <FieldError id="sessionTypes-error" message={errors.sessionTypes} />
        </fieldset>
        <fieldset>
          <legend className="font-medium">Participant experience <span className="font-normal">(optional)</span></legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {EXPERIENCE.map((flag) => (
              <label key={flag.value} className="flex gap-3 rounded border border-[#DCE6E7] p-3 dark:border-[#24363B]">
                <input type="checkbox" name="experience" value={flag.value} defaultChecked={initial.experience.includes(flag.value)} className="mt-1 size-4 shrink-0" />
                <span><span className="block font-medium">{flag.label}</span><span className="block text-sm">{flag.help}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      </Fieldset>

      <Fieldset legend="Co-hosts">
        <div>
          <label htmlFor="coHosts" className="block font-medium">Co-hosts <span className="font-normal">(optional)</span></label>
          <p id="coHosts-help" className="text-sm">
            Type @ and the person's name, then choose them from the list. Separate several people with commas.
            Only members registered for {year ? `Limicon ${year}` : "Limicon"} can co-host. Co-hosts can edit the session, and,
            like you, they're going without having to RSVP.
          </p>
          <div className="mt-1">
            <CoHostField initial={initial.coHosts} excludeIds={hostId ? [hostId] : []} error={errors.coHosts} describedBy="coHosts-help" />
          </div>
          <FieldError id="coHosts-error" message={errors.coHosts} />
        </div>
      </Fieldset>

      <Fieldset legend="When">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="date" className="block font-medium">Date</label>
            <input id="date" name="date" type="date" defaultValue={initial.date} className={`mt-1 ${input}`} {...errorProps("date", errors)} />
            <FieldError id="date-error" message={errors.date} />
          </div>
          <div>
            <label htmlFor="start" className="block font-medium">Start time</label>
            <input id="start" name="start" type="time" step={300} defaultValue={initial.start} className={`mt-1 ${input}`} {...errorProps("start", errors)} />
            <FieldError id="start-error" message={errors.start} />
          </div>
          <div>
            <label htmlFor="lengthMinutes" className="block font-medium">Length in minutes</label>
            <input
              id="lengthMinutes" name="lengthMinutes" type="number" inputMode="numeric" min={LENGTH_MIN} max={LENGTH_MAX} step={5}
              list="length-suggestions" defaultValue={initial.lengthMinutes} className={`mt-1 ${input}`} {...errorProps("lengthMinutes", errors)}
            />
            <datalist id="length-suggestions">
              {[30, 45, 60, 75, 90, 120].map((minutes) => <option key={minutes} value={minutes} />)}
            </datalist>
            <FieldError id="lengthMinutes-error" message={errors.lengthMinutes} />
          </div>
        </div>
        <div>
          <label htmlFor="timeZone" className="block font-medium">Time zone</label>
          <p id="timeZone-help" className="text-sm">Enter the date and times as they are in this zone. Everyone else sees them in their own.</p>
          <select
            id="timeZone" name="timeZone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}
            aria-describedby="timeZone-help" className={`mt-1 ${input}`} {...errorProps("timeZone", errors)}
          >
            {timeZones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
          </select>
          <FieldError id="timeZone-error" message={errors.timeZone} />
        </div>
        {status === "new" && <RepeatFields initial={initial} errors={errors} lastDay={lastDay} />}
      </Fieldset>

      <Fieldset legend="Where">
        {inPerson ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="block font-medium">City</label>
              <input id="city" name="city" defaultValue={initial.city} className={`mt-1 ${input}`} />
            </div>
            <div>
              <label htmlFor="venueNote" className="block font-medium">Venue and directions</label>
              <input id="venueNote" name="venueNote" defaultValue={initial.venueNote} className={`mt-1 ${input}`} />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="meetingLink" className="block font-medium">Meeting link <span className="font-normal">(you can add it later)</span></label>
            <p id="meetingLink-help" className="text-sm">
              Only members see it. No video room of your own? Email team@limicon.org and we'll provide a shared one.
            </p>
            <input
              id="meetingLink" name="meetingLink" type="url" inputMode="url" placeholder="https://"
              defaultValue={initial.meetingLink} className={`mt-1 ${input}`}
              aria-describedby={errors.meetingLink ? "meetingLink-help meetingLink-error" : "meetingLink-help"}
              aria-invalid={errors.meetingLink ? true : undefined}
            />
            <FieldError id="meetingLink-error" message={errors.meetingLink} />
          </div>
        )}
      </Fieldset>

      <Fieldset legend="Who can join">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="maxParticipants" className="block font-medium">Maximum participants <span className="font-normal">(optional)</span></label>
            <input
              id="maxParticipants" name="maxParticipants" type="number" inputMode="numeric" min={1} value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)} placeholder="No limit" className={`mt-1 ${input}`} {...errorProps("maxParticipants", errors)}
            />
            <FieldError id="maxParticipants-error" message={errors.maxParticipants} />
          </div>
          {maxParticipants && (
            <label className="flex items-center gap-3 self-end pb-2">
              <input type="checkbox" name="waitlist" defaultChecked={initial.waitlist} className="size-4" />
              <span className="font-medium">Keep a waitlist when it's full</span>
            </label>
          )}
        </div>
      </Fieldset>

      <Fieldset legend="Recording">
        <fieldset {...errorProps("recorded", errors)}>
          <legend className="font-medium">Will you record this session?</legend>
          <div className="mt-2 grid gap-2">
            <label className="flex gap-3"><input type="radio" name="recorded" value="yes" checked={recorded === "yes"} onChange={() => setRecorded("yes")} className="mt-1 size-4" /><span>Yes: I'll record it to my device or the cloud.</span></label>
            <label className="flex gap-3"><input type="radio" name="recorded" value="no" checked={recorded === "no"} onChange={() => setRecorded("no")} className="mt-1 size-4" /><span>No: I won't record it, or allow anyone else to.</span></label>
          </div>
          <FieldError id="recorded-error" message={errors.recorded} />
        </fieldset>
        {recorded === "yes" && (
          <fieldset {...errorProps("recordingAudience", errors)}>
            <legend className="font-medium">Who will you share the recording with?</legend>
            <div className="mt-2 grid gap-2">
              {RECORDING_AUDIENCES.map((audience) => (
                <label key={audience.value} className="flex gap-3">
                  <input type="radio" name="recordingAudience" value={audience.value} defaultChecked={(initial.recordingAudience || "members") === audience.value} className="mt-1 size-4" />
                  <span>
                    <span className="block font-medium">{audience.value === "members" ? members : audience.label}</span>
                    <span className="block text-sm">{audience.help}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError id="recordingAudience-error" message={errors.recordingAudience} />
          </fieldset>
        )}
      </Fieldset>

      <Fieldset legend="Limicon AI assistant">
        <p className="text-sm">
          The Limicon AI assistant can attend sessions to record, transcribe or summarize them, and it
          only ever does what you allow here. No AI features are switched on yet; your answer is kept
          for when they are. You can change it until the session starts.
        </p>
        <fieldset>
          <legend className="font-medium">May the Limicon AI assistant attend this session?</legend>
          <div className="mt-2 flex flex-wrap gap-6">
            <label className="flex gap-3"><input type="radio" name="aiAllowed" value="yes" checked={aiAllowed === "yes"} onChange={() => setAiAllowed("yes")} className="mt-1 size-4" /><span>Yes</span></label>
            <label className="flex gap-3"><input type="radio" name="aiAllowed" value="no" checked={aiAllowed !== "yes"} onChange={() => setAiAllowed("no")} className="mt-1 size-4" /><span>No</span></label>
          </div>
        </fieldset>
        {aiAllowed === "yes" && (
          <fieldset {...errorProps("aiPermissions", errors)}>
            <legend className="font-medium">What may it do? <span className="font-normal">(choose all that apply)</span></legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {AI_PERMISSIONS.map((permission) => (
                <label key={permission.value} className="flex gap-3">
                  <input type="checkbox" name="aiPermissions" value={permission.value} defaultChecked={initial.aiPermissions.includes(permission.value)} className="mt-1 size-4" />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
            <FieldError id="aiPermissions-error" message={errors.aiPermissions} />
          </fieldset>
        )}
      </Fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {status === "published" ? (
          <>
            <button type="submit" name="intent" value="publish" disabled={busy} className="rounded bg-[#15383F] px-5 py-2.5 font-semibold text-[#F3E6D7] disabled:opacity-60 dark:bg-[#F3E6D7] dark:text-[#15383F]">
              Save changes
            </button>
            <button
              type="submit" name="intent" value="draft" disabled={busy} aria-describedby="take-off-note"
              className="rounded border border-[#15383F] px-5 py-2.5 font-semibold disabled:opacity-60 dark:border-[#8CC7D3]"
            >
              Take off the calendar
            </button>
            <p id="take-off-note" className="basis-full text-sm">
              Taking it off the calendar saves your session as a draft. None of its information is lost, and you can
              publish it again any time.
            </p>
          </>
        ) : (
          <>
            <button type="submit" name="intent" value="publish" disabled={busy} className="rounded bg-[#15383F] px-5 py-2.5 font-semibold text-[#F3E6D7] disabled:opacity-60 dark:bg-[#F3E6D7] dark:text-[#15383F]">
              Publish to the calendar
            </button>
            <button type="submit" name="intent" value="draft" disabled={busy} className="rounded border border-[#15383F] px-5 py-2.5 font-semibold disabled:opacity-60 dark:border-[#8CC7D3]">
              Save draft
            </button>
          </>
        )}
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="font-medium text-[#B3261E] dark:text-[#F2B8B5]">
            Some answers need another look. They're marked above.
          </p>
        )}
      </div>
    </Form>
  );
}

/** The editor's starting document: the saved JSON, or nothing. */
function editorStart(value: string): RichDoc | null {
  if (!value.startsWith("{")) return value ? plainToRichText(value) : null;
  try {
    return JSON.parse(value) as RichDoc;
  } catch {
    return null;
  }
}

/**
 * Whether a new session repeats: weekly or every two weeks until a date, or on dates the host
 * lists. Each date becomes its own session with the same details, which the host can then edit
 * or cancel one at a time.
 */
function RepeatFields({ initial, errors, lastDay }: { initial: SessionFormInput; errors: FieldErrors; lastDay: string | null }) {
  const [repeat, setRepeat] = useState(initial.repeat);
  const [rows, setRows] = useState(() => {
    const saved = initial.extraDates.map((date, i) => ({ key: i, date, start: initial.extraStarts[i] ?? "" }));
    return saved.length ? saved : [{ key: 0, date: "", start: "" }];
  });
  const nextKey = Math.max(...rows.map((row) => row.key)) + 1;
  const setRow = (key: number, field: "date" | "start", value: string) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  return (
    <fieldset {...errorProps("repeat", errors)} className="grid gap-4">
      <legend className="font-medium">Does this session repeat?</legend>
      <p id="repeat-help" className="-mt-2 text-sm">
        Each date becomes its own session on the calendar, with the same details and co-hosts. You can edit or cancel each one on its own later.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {REPEATS.map((option) => (
          <label key={option.value} className="flex items-center gap-3 rounded border border-[#DCE6E7] p-3 dark:border-[#24363B]">
            <input
              type="radio" name="repeat" value={option.value} checked={repeat === option.value}
              onChange={() => setRepeat(option.value)} aria-describedby="repeat-help" className="size-4 shrink-0"
            />
            <span className="font-medium">{option.label}</span>
          </label>
        ))}
      </div>
      <FieldError id="repeat-error" message={errors.repeat} />

      {(repeat === "weekly" || repeat === "biweekly") && (
        <div>
          <label htmlFor="repeatUntil" className="block font-medium">Repeat until</label>
          <p id="repeatUntil-help" className="text-sm">
            {repeat === "weekly" ? "Every week" : "Every two weeks"} on the same day and at the same time, up to and including this date.
          </p>
          <input
            id="repeatUntil" name="repeatUntil" type="date" defaultValue={initial.repeatUntil || lastDay || ""} max={lastDay ?? undefined}
            className={`mt-1 sm:max-w-60 ${input}`}
            aria-describedby={errors.repeatUntil ? "repeatUntil-help repeatUntil-error" : "repeatUntil-help"}
            aria-invalid={errors.repeatUntil ? true : undefined}
          />
          <FieldError id="repeatUntil-error" message={errors.repeatUntil} />
        </div>
      )}

      {repeat === "custom" && (
        <fieldset {...errorProps("extraDates", errors)}>
          <legend className="font-medium">Other dates and times</legend>
          <p className="text-sm">In the same time zone as above. Each one runs for the same length.</p>
          <ul className="mt-2 grid gap-3">
            {rows.map((row, index) => (
              <li key={row.key} className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor={`extraDate-${row.key}`} className="block text-sm font-medium">Date {index + 2}</label>
                  <input
                    id={`extraDate-${row.key}`} name="extraDates" type="date" value={row.date} max={lastDay ?? undefined}
                    onChange={(e) => setRow(row.key, "date", e.target.value)} className={`mt-1 ${input}`}
                  />
                </div>
                <div>
                  <label htmlFor={`extraStart-${row.key}`} className="block text-sm font-medium">Start time</label>
                  <input
                    id={`extraStart-${row.key}`} name="extraStarts" type="time" step={300} value={row.start}
                    onChange={(e) => setRow(row.key, "start", e.target.value)} className={`mt-1 ${input}`}
                  />
                </div>
                {rows.length > 1 && (
                  <button
                    type="button" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                    className="px-2 py-2 text-sm underline" aria-label={`Remove date ${index + 2}`}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button" onClick={() => setRows([...rows, { key: nextKey, date: "", start: rows.at(-1)?.start ?? "" }])}
            className="mt-3 rounded border border-[#15383F] px-4 py-2 text-sm font-semibold dark:border-[#8CC7D3]"
          >
            + Add another date
          </button>
          <FieldError id="extraDates-error" message={errors.extraDates} />
        </fieldset>
      )}
    </fieldset>
  );
}
