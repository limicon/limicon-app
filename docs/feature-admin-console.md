# Admin console

The Organizing Team's console at `/admin` (ADM-1). It covers the current edition: the one with the latest year.

Status: draft, 2026-11-18. Built: Overview, Edition, Sessions, Tickets and Team. Discount codes, forms, emails, site content and the CSV exports other than registrations come with the features they manage.

## Access

- Any row in `admin_permissions` opens the console. A signed-in person without one gets a plain 404, and a visitor goes to sign in (`requireAdmin` in `app/middleware/services.server.ts`).
- The only permission is `full`, until the Organizing Team settles narrower ones (PRD open question 2). Adding and removing admins needs `full`; every other page needs any permission. `ADMIN_PERMISSIONS` in `app/lib/admin-forms.ts` lists them.
- Admins can't remove their own access, so the team can't lock itself out by accident.
- The Members area's sidebar shows an Admin console link to admins.

## Pages

| Page | What admins do there |
| --- | --- |
| Overview | Analytics for the edition: ticket holders, revenue, accounts, admins, registrations per week for 12 weeks, ticket holders by tier, and session counts. Each chart has a table view. |
| Edition | Event dates (which bound when hosts can publish), the registration and calendar switches (REG-10, CAL-9), the Miro and Castalia links (MEM-2) and ticket tiers (REG-3). A tier anyone holds a ticket in can be renamed or repriced, not removed. |
| Sessions | Every session, drafts included, filtered by status or co-creation. Admins take a session off the calendar (SES-4), mark co-creation meetings (SES-9), and edit through the hosts' own editor. |
| Tickets | Every registration, searchable by name or email, with a CSV download (ADM-2). Admins issue comp tickets to an existing account and remove them (REG-9). Paid tickets are refunded through Stripe (REG-8), so the console has no refund button yet. |
| Team | Who holds which permission, and who granted it. Adding an email with an account grants at once; otherwise it waits in `admin_invitations` until that address first signs in. No email is sent. |

The calendar switch is stored, but the schedule and Host a session pages don't act on it yet.

## Code

- `app/routes/admin/`: the layout and one route per page, plus `tickets-csv.ts`.
- `app/lib/admin.server.ts`: the queries, tested in `admin.server.test.ts` against the local database.
- `app/lib/admin-forms.ts`: form checks, money formatting and CSV, tested in `admin-forms.test.ts`.
