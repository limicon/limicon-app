import { useEffect, useRef, useState } from "react";

import { subscribeLinks } from "~/lib/google-calendar";

const primary =
  "inline-block rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]";
const secondary = "inline-block rounded border border-[#15383F] px-4 py-2 font-semibold dark:border-[#8CC7D3]";

/**
 * The schedule's "Subscribe to the Limicon calendar" button and the panel it opens, which explains the two
 * ways onto a member's own calendar: an invite for each session they RSVP to, or subscribing to
 * the Limicon Schedule calendar, which stays live (docs/feature-calendaring.md → Google Calendar).
 */
export function CalendarSubscribe({ calendarId, invites }: { calendarId: string; invites: boolean }) {
  const links = subscribeLinks(calendarId);
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={secondary}>
        <span aria-hidden="true">📅 </span>Subscribe to the Limicon calendar
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="calendar-subscribe-title"
        onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}
        className="m-auto w-[min(40rem,calc(100%-2rem))] rounded-lg bg-white p-0 text-[#15383F] backdrop:bg-black/50 dark:bg-[#0F1C1E] dark:text-[#E4ECEC]"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="calendar-subscribe-title" className="text-xl font-semibold">Get Limicon on your calendar</h2>
            <button type="button" onClick={() => dialog.current?.close()} className="rounded px-2 text-2xl leading-none" aria-label="Close">
              ×
            </button>
          </div>
          {invites && <p className="mt-2">There are two ways. Use whichever suits you, or both.</p>}

          {invites && (
            <section className="mt-5">
              <h3 className="font-semibold">1. RSVP to the sessions you're going to</h3>
              <p className="mt-1">
                Each time you RSVP, we email you a calendar invite for that session. Add it to Google Calendar, Apple
                Calendar, Outlook or any calendar app you use, and you'll get reminders the way your calendar is set to
                give them. If the session's time, title or link changes, the invite updates itself. Cancel your RSVP
                and the invite is removed.
              </p>
            </section>
          )}

          <section className="mt-5">
            <h3 className="font-semibold">{invites ? "2. " : ""}Subscribe to the Limicon calendar</h3>
            <p className="mt-1">
              Every session on the schedule shows on your own calendar, alongside your other events, and stays up to
              date as sessions are added, moved or cancelled. It's a live subscription, not a one-time copy.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href={links.google} target="_blank" rel="noreferrer" className={primary}>Google Calendar</a>
              <a href={links.webcal} className={primary}>Apple Calendar or Outlook</a>
              <button
                type="button"
                className={secondary}
                onClick={() => navigator.clipboard.writeText(links.ical).then(() => setCopied(true), () => {})}
              >
                {copied ? "✓ Copied" : "Copy the calendar address"}
              </button>
            </div>
            <ul className="mt-3 list-disc pl-5 text-sm">
              <li>
                The Limicon calendar is an overlay, kept apart from your own events. Show or hide it whenever you like
                by ticking or unticking its checkbox in your calendar app's list of calendars.
              </li>
              <li>Google Calendar shows changes straight away. Other calendar apps check for them every few hours.</li>
              <li>
                On a phone, Google Calendar can't subscribe from a link. Subscribe on a computer, and the calendar shows
                on your phone too.
              </li>
              <li>For any other app, paste the calendar address where it offers to add or subscribe to a calendar by URL.</li>
              <li>The subscription shows each session's time and hosts. Open a session from it to see the meeting link and RSVP.</li>
              {invites && (
                <li>If you do both, sessions you RSVP to appear twice. Your calendar app can hide either calendar.</li>
              )}
            </ul>
          </section>
        </div>
      </dialog>
    </>
  );
}
