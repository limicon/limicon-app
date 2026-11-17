# Sessions

How sessions sit in time: times and time zones, the session lifecycle, repeating sessions, and RSVPs. [`feature-calendaring.md`](feature-calendaring.md) covers getting sessions onto members' own calendars. The session form's fields and what hosts and admins may do are in the PRD: [Session form fields](Limicon%20Platform%20PRD.md#session-form-fields) and requirements SES-1 to SES-10 and CAL-1 to CAL-10.

Status: draft, 2026-11-15. Nothing is built yet.

## Times and time zones

- A session stores `starts_at` and `ends_at` as `timestamptz`, and `time_zone` as an IANA zone name such as `America/Toronto`.
- The host enters a date and clock times in the session's zone, which defaults to the host's profile time zone. The server converts them to instants.
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

A session is either unpublished or published. "Save draft" in the editor saves it unpublished.

| Status | Calendar page | Members' own calendars |
|---|---|---|
| Unpublished | Its hosts and admins only | Never; leaving published removes it from feeds and sends cancellations to invite holders |
| Published | Everyone the role allows | Yes |

- **Cancelling** a session means unpublishing it. Members who RSVPed get the NOT-1 email, and My Schedule shows the session to them as cancelled.
- **Deleting** a session that has RSVPs or has sent calendar invites unpublishes it instead of removing it, so the cancellations can go out and the RSVPs stay as a record. Sessions with neither are removed.
- **Past sessions** are the ones whose `ends_at` has passed. No status marks them, so nothing has to update sessions as time passes.

## Repeating sessions

Limicon doesn't make recurrence easy. The editor has no Repeat control, and no recurrence rules exist. A host who wants a session to happen more than once duplicates it.

- **Duplicate.** Any session the host can edit has a Duplicate action. It opens the editor with every field filled in from the original, co-hosts included, and the date left empty. Saving creates a new, independent session.
- **Clock time.** The copy keeps the original's clock time in the session's zone, and the host picks only the date. Compute the copy's start and end from that local date and time. Adding days to the original start shifts copies that fall after a daylight-saving change.
- **Each copy is a full session,** with its own RSVPs, capacity, waitlist, meeting link, status and calendar event.
- **Linking copies (option).** Copies can stay unlinked, or Duplicate can give them a shared `sessions.series_id` (uuid, nullable). With a link, session pages can show "Also on" with links to the other dates. Any action that works across the series, such as RSVPing to all of it or editing "this and later sessions", brings back the easy recurrence Limicon is avoiding.

Each copy is an ordinary session to everything else, including RSVPs, reminders, feeds, invites, harvest forms and content. Nothing has to expand rules or track exceptions to them, and calendar events need no `RRULE` or time-zone blocks.

## RSVPs

- RSVPs live only in the app: one click to RSVP and one to cancel (CAL-5). Replies to calendar invites aren't read back ([`feature-calendaring.md`](feature-calendaring.md#replies-to-invites)).
- `session_rsvps` holds the session, the member, the status (registered or waitlisted), `wants_reminder` (CAL-6) and `created_at`.
- **Capacity.** The capacity check and the insert happen in one transaction that locks the session row (`select … for update`), so two members can't take the last place at once.
- **Waitlist.** When a registered member cancels, the earliest waitlisted RSVP becomes registered. Calendaring treats a promotion like a new RSVP.
- **Unpublished sessions** keep their RSVPs, as history and as the list of members who were told.

## Open questions

- Are copies linked by `series_id`, and if so, does anything beyond "Also on" links use the link?
- Do copies share pre-reading files, or does each copy get its own?
- Does unpublishing keep RSVPs for a later re-publish, or clear them?
- When does RSVP close: at the start, at the end, or never?
