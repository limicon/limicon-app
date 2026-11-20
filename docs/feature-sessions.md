# Sessions

How sessions sit in time: times and time zones, the session lifecycle, repeating sessions, and RSVPs. [`feature-calendaring.md`](feature-calendaring.md) covers getting sessions onto members' own calendars. The session form's fields and what hosts and admins may do are in the PRD: [Session form fields](Limicon%20Platform%20PRD.md#session-form-fields) and requirements SES-1 to SES-10 and CAL-1 to CAL-10.

Status: draft, 2026-11-20. Built: hosting (host guidelines, the session editor with drafts, publishing and co-hosts, each host's list of sessions, in `app/routes/members/host*.tsx`), and the schedule's list, 3 Day and Monthly views with session pages, RSVPs, the waitlist and My Schedule (`app/routes/members/schedule*.tsx`). Also repeating sessions and the About preview on schedule cards. Not yet: Duplicate.

## Times and time zones

- A session stores `starts_at` and `ends_at` as `timestamptz`, and `time_zone` as an IANA zone name such as `America/Toronto`.
- The host enters a date, a start time and a length in minutes, in the session's zone, which defaults to the host's browser time zone. The server converts the start to an instant and adds the length for the end, so a session can run past midnight. `app/lib/zoned-time.ts` does the conversion with `Intl`.
- Viewers see times in their own zone, or the one they pick (CAL-3). Display uses only the instants.
- The stored zone records what the host meant. The editor uses it to show hosts their own clock times, and Duplicate uses it to keep the same clock time across a daylight-saving change.
- Convert with a time-zone-aware library, or `Temporal` where the runtime has it. Adding hours to a `Date` gets daylight saving wrong.
- A clock time that doesn't exist in the session's zone (skipped when clocks go forward) fails validation with a message. A time that happens twice (when clocks go back) takes the earlier one.

### Daylight saving during the event

Limicon runs for about four weeks around the March equinox, when much of the world changes its clocks. In 2027:

- 14 March: the US and Canada move to daylight time.
- 28 March: the UK and EU move to summer time.
- 4 April: New Zealand and south-eastern Australia leave daylight time.

Between 14 and 28 March, Toronto is 4 hours behind London instead of 5. A weekly 12:00 Toronto session is at 17:00 London on 10 March and at 16:00 on 17 March. Tests use dates on both sides of each change.

## Lifecycle

A session is either unpublished or published. "Save draft" in the editor saves it unpublished, and "Take off the calendar" turns a published session back into a draft, keeping every field. Once saved, "Save draft" (or "Save changes", for a published session) grays out as "Draft saved" (or "Saved") until the host changes something, and again if they undo it, so they can see it's saved. The editor compares the form's answers with how they were when it opened (`useChanged` in `app/components/session-editor.tsx`).

| Status | Calendar page | Members' own calendars |
|---|---|---|
| Unpublished | Its hosts and admins only | Never; leaving published removes it from feeds and sends cancellations to invite holders |
| Published | Everyone the role allows | Yes |

- **Cancelling** a session means unpublishing it. Members who RSVPed get the NOT-1 email, and My Schedule shows the session to them as cancelled.
- **Deleting** a session that has RSVPs or has sent calendar invites unpublishes it instead of removing it, so the cancellations can go out and the RSVPs stay as a record. Sessions with neither are removed.
- **Past sessions** are the ones whose `ends_at` has passed. No status marks them, so nothing has to update sessions as time passes.

## Repeating sessions

A new session's form asks whether it repeats: no, weekly, every two weeks, or on other dates the host lists, each with its own start time. Weekly and two-weekly repeats run until a date the host picks, which defaults to the event's last day. Saving creates one full session per date in one transaction (`createSession`), all sharing a `sessions.series_id`. No recurrence rules are stored.

- **Clock time.** Each date keeps the first one's clock time in the session's zone, so a weekly noon session stays at noon across a daylight-saving change (`checkRepeats` in `app/lib/session-form.ts`). Adding days to the first start would shift later dates by an hour.
- **Titles and descriptions.** "All sessions have the same title and description" starts checked, and every date takes the first one's. Unchecked, the form shows a title and description box for each further date, such as for a series in parts; an empty box takes the first session's. `repeatRows` in `app/lib/session-form.ts` lists the dates in the same order for the form and the server, which reads the boxes against it.
- **Each date is a full session,** with its own RSVPs, capacity, waitlist, meeting link, status and calendar event. Hosts edit, unpublish or delete each date on its own; the edit page lists the series' other dates, and the session page shows members the published ones under "Also on". Schedule cards and session pages mark each published date that has another on the calendar "Recurring session" (`SeriesBadge`). They don't number the parts, so members don't read a later date as needing the earlier ones.
- **Nothing works across the series,** such as RSVPing to every date or editing "this and later sessions". Each date is an ordinary session to everything else, including RSVPs, reminders, feeds, invites, harvest forms and content, so calendar events need no `RRULE` or time-zone blocks.
- **Limits.** Up to 30 extra dates, all within the event.
- **Duplicate (not built).** A Duplicate action on any session the host can edit would open the editor filled in from the original, co-hosts included, with the date left empty.

## Co-hosts

Hosts add co-hosts in the editor (SES-5) by typing @ and a name, then choosing the person, as an email app picks recipients; a comma, Enter or Tab takes the highlighted match. Only tags are posted, so typed text never becomes a co-host. The search (`/members/host/people`, `findMembers`) finds members who can co-host: current-edition ticket holders and admins, not deactivated, by name or a whole email address, with a masked email to tell apart people of the same name. On save the server checks every id again (`ineligibleCoHosts`). Co-hosts can edit the session like its host; the host who created it can't be removed.

## Schedule

Members > Schedule (`app/routes/members/schedule*.tsx`) shows the edition's published sessions. The queries are in `app/lib/schedule.server.ts`.

- **Layouts (CAL-1).** Tabs switch between List, 3 Day and Monthly, kept in the URL as `?layout=3day` or `?layout=month` with the shown days in `?date=`, so links and the back button keep them. Each layout works with every schedule (Limicon, My Schedule, Hosting), the search and filters, the viewer's zone and live updates. List is the default everywhere for now; the PRD asks for 3 Day as the desktop default.
  - **List.** Sessions grouped by the viewer's calendar day, upcoming soonest first, with past sessions behind a filter.
  - **3 Day.** Three days side by side, each session placed by its times in the viewer's zone, with overlapping sessions sharing the column: up to three side by side, two on phones, and the rest behind a "+N more" pop-up. Previous and Next move three days.
  - **Monthly.** A Sunday-first grid, with each date's first sessions on wider screens and a count on phones. Hovering a date, focusing it, or tapping or pressing Enter on it opens a pop-up listing that date's sessions with links; Escape, the X or tapping outside closes it. Previous and Next move a month.
  - Both calendar layouts show every session starting in their days, finished or not, so they have no When filter. Without a `date` they open on today, or on the event's first day while the event is ahead. Day arithmetic and the 3 Day lanes are in `app/lib/calendar.ts`; the views in `app/components/schedule-calendar.tsx`.
- **Theme colors (CAL-11).** `app/lib/themes.ts` gives each theme a color, used only as a stripe and a dot beside the theme's name, never as text color. A legend lists all nine.
- **About this session.** Hosts format the description in a basic rich text editor (bold, italics, underline, strikethrough, lists, quotes, links, emoji; no headings or uploads). `sessions.description_doc` holds the cleaned document (`app/lib/rich-text.ts`) that session pages draw; `sessions.description` keeps its plain text for search.
- **Cards.** A click anywhere on a session's card opens its page. The card shows the first two lines of About this session, and Read more opens the full formatted text in place; the RSVP and Edit controls, Read more and the opened text keep their own clicks.
- **Photos.** Each session shows a square picture: on the left of its list card, and at the top of its page beside the title and hosts. It's the session's own photo (`sessions.image_key`, optional in the editor), else the profile picture of the host who created it (`profiles.avatar_key`, set on the account page), else Limicon's logo (`public/logo-square.png`); `sessionPhoto` in `app/lib/photos.ts` chooses, with alt text for each. Before uploading, the photo cropper (`app/components/photo-cropper.tsx`, geometry in `app/lib/photo-crop.ts`) shows the photo behind a dotted square, or a dotted circle for profile pictures, where members zoom, drag or use the arrow keys to place it, or tick Fit the whole photo to show all of it on Limicon's teal. The browser then draws an 800 × 800 JPEG, so any photo it can open works, whatever its size or shape. That JPEG goes to `/upload/photo` (`app/routes/upload-photo.ts`): members and admins only, PNG, JPEG, GIF or WebP up to 5 MB, and the file's first bytes must match its type. The file goes into the R2 media bucket at once, and only the form's Save puts its key on the session or profile; Save waits while an upload is unfinished, and the database refuses keys that aren't stored images.
- **Three schedules.** Limicon Schedule (every session), My Schedule (`?view=mine`, below) and Hosting (`?view=hosting`: published sessions the member hosts or co-hosts, each with an Edit link, and a "+ Host a Session" button). Above them, Hosting shows a **Drafts** section when the member has unpublished sessions, each with Edit and **Publish to Calendar**. Publishing there runs the editor's publish checks on the saved draft (`publishDraft` in `app/lib/session-actions.server.ts`); a draft that's missing something stays a draft, and its card lists what to add. Drafts are also listed under Host a session.
- **Search and filters (CAL-2).** The search matches titles, descriptions and host names, ignoring case. Theme and session type filter too. All of them live in the URL, so a filtered view can be shared.
- **The viewer's time zone (CAL-3).** The zone a member picks, saved as `profiles.time_zone`; otherwise their browser's, which the page reads on the first visit and keeps in a `tz` cookie; otherwise Toronto's. `app/lib/format-time.ts` names the zone and locale in every format, so the server and the browser render the same text and hydration matches. A session's page also shows the host's own time when the zones differ.
- **Live updates (CAL-4).** While the tab is visible, an open schedule or session page fetches `/members/schedule/version` every 10 seconds: a marker built from the count of published sessions, the latest `updated_at` and the total count. When it changes, the page reloads its data. Browsers can't subscribe to Supabase Realtime because the tables have no RLS policies, and Hyperdrive's read caching is off, so each check sees the current database.
- **Session pages (CAL-10)** show the meeting link only inside the Members area, which only ticket holders and admins can open.

## RSVPs

- RSVPs live only in the app: one click to RSVP and one to cancel (CAL-5). RSVPs open while a session is published and close when it ends. Replies to calendar invites aren't read back ([`feature-calendaring.md`](feature-calendaring.md#replies-to-invites)).
- `session_rsvps` holds the session, the member, the status (registered or waitlisted) and `created_at`. Reminders come from members' own calendars (CAL-6), so RSVPs store no reminder choice.
- **My Schedule** is the schedule page filtered to the member's RSVPs and the sessions they host (`?view=mine`), with the same search and filters.
- **Hosts are going.** Hosts and co-hosts never RSVP to their own sessions: they show as "Going · You're hosting", don't take places, and `rsvp()` returns `hosting` for them. Adding someone as a co-host removes their RSVP and moves the waitlist up into the freed place.
- **Capacity.** The capacity check and the insert happen in one transaction that locks the session row (`select … for update`), so two members can't take the last place at once.
- **Waitlist.** When a registered member cancels, the earliest waitlisted RSVP becomes registered. Calendaring treats a promotion like a new RSVP.
- **Unpublished sessions** keep their RSVPs, as history and as the list of members who were told, and a re-published session has them back. Deleting a session that has RSVPs unpublishes it instead.

## Open questions

- Are copies linked by `series_id`, and if so, does anything beyond "Also on" links use the link?
- Do copies share pre-reading files, or does each copy get its own?
