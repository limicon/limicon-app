import { useFetcher } from "react-router";

type Status = "registered" | "waitlisted" | "hosting" | null;

const primary =
  "rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] disabled:opacity-60 dark:bg-[#F3E6D7] dark:text-[#15383F]";
const secondary = "rounded border border-[#15383F] px-4 py-2 font-semibold disabled:opacity-60 dark:border-[#8CC7D3]";

/**
 * One click to RSVP and one to cancel (CAL-5), posting to the session's page and updating in
 * place. Shows the new state straight away while the request runs.
 */
export function RsvpButton({
  sessionId,
  status,
  title,
  full = false,
  waitlistEnabled = true,
}: {
  sessionId: string;
  status: Status;
  /** The session's title, so screen readers know which session a button is for. */
  title: string;
  full?: boolean;
  waitlistEnabled?: boolean;
}) {
  const fetcher = useFetcher<{ outcome?: string }>();
  const pending = fetcher.formData?.get("intent");
  const shown: Status | "pending" =
    pending === "rsvp" ? "pending" : pending === "cancel" ? null : status;
  const refused = fetcher.data?.outcome === "full";

  // Hosts are always going, with no RSVP to make or cancel.
  if (status === "hosting") {
    return (
      <span className="inline-block rounded-full bg-[#CDEBE3] px-3 py-0.5 text-sm font-semibold text-[#0F4A3C]">
        Going · You're hosting
      </span>
    );
  }

  if (shown === "registered" || shown === "waitlisted") {
    return (
      <fetcher.Form method="post" action={`/members/schedule/${sessionId}`} className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${shown === "registered" ? "bg-[#CDEBE3] text-[#0F4A3C]" : "bg-[#F9DCBD] text-[#5A3612]"}`}>
          {shown === "registered" ? "Going" : "Waitlisted"}
        </span>
        <button type="submit" name="intent" value="cancel" onClick={(event) => { if (!confirm(shown === "registered" ? `Cancel your RSVP to ${title}?` : `Leave the waitlist for ${title}?`)) event.preventDefault(); }} className={secondary} aria-label={`Cancel your RSVP to ${title}`}>
          Cancel
        </button>
      </fetcher.Form>
    );
  }

  const label = full ? (waitlistEnabled ? "Join the waitlist" : "Full") : "RSVP";
  return (
    <fetcher.Form method="post" action={`/members/schedule/${sessionId}`} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        name="intent"
        value="rsvp"
        disabled={shown === "pending" || (full && !waitlistEnabled)}
        className={primary}
        aria-label={`${label} for ${title}`}
      >
        {shown === "pending" ? "Saving…" : label}
      </button>
      {refused && <span role="alert" className="text-sm font-medium">That session just filled up.</span>}
    </fetcher.Form>
  );
}
