# Admin console

The Organizing Team's console at `/admin` (ADM-1). It covers the current edition: the one with the latest year. Its user and session pages follow the Festival platform's admin console (`reference-festival.md` → 5.8 and 9.7).

Status: draft, 2026-11-18. Built: Overview, Settings, Users, Sessions, Tickets, FAQ and Team. Discount codes, forms, emails, site content other than the FAQ, and the sessions and form-response exports come with the features they manage.

## Access

- Any row in `admin_permissions` opens the console. A signed-in person without one gets a plain 404, and a visitor goes to sign in (`requireAdmin` in `app/middleware/services.server.ts`). Nothing outside the console links to it except for admins.
- The only permission is `full`, until the Organizing Team settles narrower ones (PRD open question 2). Changing anyone's admin roles, and deactivating another admin, need `full`; everything else needs any permission. `ADMIN_PERMISSIONS` in `app/lib/admin-forms.ts` lists them.
- Admins can't remove their own access or deactivate themselves, so the team can't lock itself out by accident.
- A deactivated account (`profiles.deactivated_at`) can't open the Members area or the console, whatever it holds (MSG-4). Its data stays.

## Pages

| Page | What admins do there |
| --- | --- |
| Overview | Analytics for the edition: ticket holders, revenue, accounts, admins, registrations per week for 12 weeks, ticket holders by tier, and session counts. Each chart has a table view. |
| Settings | Event dates (which bound when hosts can publish), the registration and calendar switches (REG-10, CAL-9), the links members see (MEM-2, any number, with "Add new link") and ticket tiers (REG-3). A tier anyone holds a ticket in can be renamed or repriced, not removed. |
| Users | Every account, searchable by name or email and filtered by ticket status, role and active or deactivated, with a CSV download (ADM-2). Each person's page shows when they joined and last signed in, their tickets, roles, sessions, RSVP count and registration answers. Admins edit their name, add or remove admin roles, deactivate or reactivate the account, and keep private notes. |
| Sessions | Every session, drafts included, filtered by status or co-creation. Admins edit any session in the hosts' editor inside the console, publish, take off the calendar or delete it (SES-4), see its hosts and RSVPs, and mark co-creation meetings (SES-9). |
| Tickets | Every registration, searchable by name or email, with a CSV download (ADM-2). Admins issue comp tickets to an existing account and remove them (REG-9). Paid tickets are refunded through Stripe (REG-8), so the console has no refund button yet. |
| FAQ | The public `/faq` page's questions and answers (PUB-1), added and updated as questions come in. Entries can be drafts, reordered and deleted. Answers are plain text: a blank line starts a paragraph, and web and email addresses become links. |
| Team | Who holds which permission, and who granted it. Adding an email with an account grants at once; otherwise it waits in `admin_invitations` until that address first signs in. No email is sent. |

The calendar switch is stored, but the schedule and Host a session pages don't act on it yet. Members don't see the member links yet either: the Members area will show them.

## Code

- `app/routes/admin/`: the layout and one route per page, plus `tickets-csv.ts` and `users-csv.ts`. `app/routes/public/faq.tsx` is the public FAQ.
- `app/lib/admin.server.ts`, `admin-users.server.ts` and `faq.server.ts`: the queries, tested against the local database in `admin.server.test.ts` and `admin-users.server.test.ts`.
- `app/lib/admin-forms.ts`: form checks, money formatting and CSV, tested in `admin-forms.test.ts`. `app/lib/admin-users.ts` holds the Users page's filters, which the page itself needs too, so they can't live in a `.server` file.
