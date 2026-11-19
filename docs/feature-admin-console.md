# Admin console

The Organizing Team's console at `/admin` (ADM-1). It covers the current edition: the one with the latest year. Its user and session pages follow the Festival platform's admin console (`reference-festival.md` → 5.8 and 9.7).

Status: draft, 2026-11-19. Built: Overview, Edit, Users, Orders, Guests, Sessions, Tickets, FAQ, Policies and Team. Discount codes, forms, emails, editing the rest of the public website, and the sessions and form-response exports come with the features they manage.

## Access

- Any row in `admin_permissions` opens the console. A signed-in person without one gets a plain 404, and a visitor goes to sign in (`requireAdmin` in `app/middleware/services.server.ts`). Only admins see an **Admin** button: last in the public site's menu, and in the Members area's menu.
- The only permission is `full`, until the Organizing Team settles narrower ones (PRD open question 2). Changing anyone's admin roles, and deactivating another admin, need `full`; everything else needs any permission. `ADMIN_PERMISSIONS` in `app/lib/admin-forms.ts` lists them.
- Admins can't remove their own access or deactivate themselves, so the team can't lock itself out by accident.
- A deactivated account (`profiles.deactivated_at`) can't open the Members area or the console, whatever it holds (MSG-4). Its data stays.

## Pages

| Page | What admins do there |
| --- | --- |
| Overview | The four totals (ticket holders, revenue, accounts, admins), the same four for the last 7 days, which open to list who bought in that week, newest first, with their emails; registrations per week; and sessions, including every session ever put on the calendar. |
| Edit | The event as the public sees it (PUB-2): name, teaser, start and end each with a time zone (visitors see them in their own zone), event image (Upload, then Change or Delete), and About in the rich text editor. Save or Cancel. Below: the registration and calendar switches (REG-10, CAL-9), the links members see (MEM-2, with "Add new link") and ticket tiers (REG-3). |
| Users | Every account, searchable and filtered by ticket status, role and active or deactivated, with a CSV download. Each person's page shows when they joined and last signed in, their tickets, roles, sessions, RSVPs and registration answers. Admins edit their name, add or remove admin roles, deactivate or reactivate the account, and keep private notes. |
| Orders | The number of orders, tickets bought (an order can buy several) and revenue, then every order: name, order date, ticket (tier), quantity, status (paid in green, incomplete in red) and price ("Comped" for comps). Click a heading to sort by it, again to reverse. Search, filter by status (incomplete ones are checkouts to follow up) and ticket, and download with a checkbox per column. Details at the foot: ticket holders by tier. |
| Guests | How many people hold a ticket, then each one: name, email (a mail link), address from their registration and a link to their profile. First-name order, switchable to last name; search; download with a checkbox per column. |
| Sessions | Every session, drafts included, filtered by status or co-creation. Admins edit any session in the hosts' editor inside the console, publish, take off the calendar or delete it (SES-4), see its hosts and RSVPs, and mark co-creation meetings (SES-9). |
| Tickets | Comp tickets for an existing account, which admins issue and remove (REG-9), as an order of one. A preview of the registration form as registrants see it, with **Edit** to reword, reorder, remove and add fields: short answer, long answer, checkbox (optionally linking to a page), headline or paragraph text. Then every ticket holder. |
| FAQ | The public `/faq` page's questions and answers (PUB-1), added and updated as questions come in. |
| Policies | The Privacy Policy and Code of Conduct, each with **Edit**, which opens it in the rich text editor; saved changes show on `/privacy` and `/conduct` straight away. Until a policy is first edited, its page shows the text in `app/content/policies.tsx`. |
| Team | Who holds which permission, and who granted it. Adding an email with an account grants at once; otherwise it waits in `admin_invitations` until that address first signs in. No email is sent. |

The calendar switch is stored, but the schedule and Host a session pages don't act on it yet. Members don't see the member links yet either. Checkout isn't built, so nothing creates paid or pending orders yet; until then the Orders page shows comps and any imported tickets.

## Rich text and uploads

- The rich text editor (`app/components/rich-text-editor.tsx`, TipTap) offers bold, italic, underline, strikethrough, headings, lists, quotes, alignment, links, emoji, images and file attachments. It loads only in the browser: TipTap can't run in the Worker. `vite.config.ts` pre-bundles its packages, because Vite otherwise finds them late and loads a second copy of React in development.
- Documents are stored as TipTap JSON, never HTML. `cleanRichText` in `app/lib/rich-text.ts` keeps only the nodes, marks and attributes `components/rich-text.tsx` draws, and allows links only to the web, email and the site's own pages, and images only from the media bucket or https.
- Admins upload images and files through `/admin/upload` into the R2 bucket `limicon-media` ([`config-cloudflare.md`](config-cloudflare.md)), served at `/media/<key>`. Allowed types are images (not SVG), PDF, text and office documents, up to 10 MB each, listed in `app/lib/media.ts`. Replacing the event image deletes the old one; files removed from rich text stay in the bucket.

## Code

- `app/routes/admin/`: the layout and one route per page, plus the CSV downloads (`*-csv.ts`) and `upload.ts`. `app/routes/media.ts` serves uploads.
- `app/lib/admin.server.ts`, `admin-users.server.ts`, `orders.server.ts`, `event.server.ts`, `site-documents.server.ts`, `registration.server.ts` and `faq.server.ts`: the queries, tested against the local database.
- `app/lib/admin-forms.ts`, `admin-tables.ts`, `admin-users.ts` and `registration-form.ts`: form checks, table columns, filters and sorting, shared by pages, downloads and queries.
