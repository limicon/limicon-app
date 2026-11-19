-- What admins edit in the console: the event itself, orders, the registration form's fields and
-- the policies. Like every table, RLS is enabled with no policies; server code reads and writes
-- them through Hyperdrive.

-- The event's public details (PUB-2). The start and end are instants, each with the zone the
-- admin entered it in; pages show them in each viewer's zone. starts_on and ends_on stay as the
-- event's calendar days in those zones, which bound when hosts can publish sessions.
alter table public.editions
  add column name text check (char_length(name) <= 120),
  add column teaser text check (char_length(teaser) <= 300),
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column start_time_zone text,
  add column end_time_zone text,
  -- The event image's key in the media bucket (R2).
  add column image_key text,
  -- The About text as a rich text document (TipTap JSON), rendered through an allowlist.
  add column about jsonb,
  add constraint editions_times_in_order check (starts_at is null or ends_at is null or ends_at > starts_at);

update public.editions set name = 'Limicon ' || year where name is null;

-- A purchase (REG-6). One order can buy several tickets of a tier. `pending` is a checkout that
-- was started and not paid, so admins can follow up; `comp` covers tickets admins issue (REG-9).
create table public.orders (
  id bigint generated always as identity primary key,
  edition_id bigint not null references public.editions (id),
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  tier_id bigint references public.ticket_tiers (id),
  quantity integer not null default 1 check (quantity between 1 and 50),
  status text not null check (status in ('pending', 'paid', 'comp', 'refunded')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  backfill_ticket_id bigint
);

alter table public.orders enable row level security;

create index orders_by_edition on public.orders (edition_id, created_at desc);

alter table public.tickets add column order_id bigint references public.orders (id) on delete set null;

-- Every ticket so far came from its own order.
insert into public.orders (edition_id, buyer_id, tier_id, quantity, status, amount_cents, stripe_checkout_session_id, created_at, completed_at, backfill_ticket_id)
select edition_id, profile_id, tier_id, 1, status, amount_paid_cents, stripe_checkout_session_id, created_at, created_at, id
from public.tickets;

update public.tickets t set order_id = o.id from public.orders o where o.backfill_ticket_id = t.id;

alter table public.orders drop column backfill_ticket_id;

-- The registration form's fields after the name and email (REG-2), which admins edit. Headlines
-- start a section and paragraphs explain; neither takes an answer. Answers in
-- registration_answers name their field by `key`, which never changes, so admins can reword a
-- field without losing what people answered.
create table public.registration_fields (
  id bigint generated always as identity primary key,
  edition_id bigint not null references public.editions (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,59}$'),
  kind text not null check (kind in ('short', 'long', 'checkbox', 'headline', 'paragraph')),
  label text not null check (char_length(label) between 1 and 2000),
  help text check (char_length(help) <= 500),
  required boolean not null default false,
  -- An optional link under a checkbox, such as to the Code of Conduct.
  link_url text check (link_url ~ '^(https://|/)'),
  link_text text check (char_length(link_text) <= 100),
  sort_order integer not null default 0,
  unique (edition_id, key)
);

alter table public.registration_fields enable row level security;

create index registration_fields_order on public.registration_fields (edition_id, sort_order);

-- Every edition starts with the form as it stood in code.
insert into public.registration_fields (edition_id, key, kind, label, help, required, link_url, link_text, sort_order)
select e.id, f.key, f.kind, f.label, f.help, f.required, f.link_url, f.link_text, f.sort_order
from public.editions e
cross join (values
  ('address', 'long', 'Address', 'Your mailing address.', false, null, null, 0),
  ('location_heading', 'headline', 'Location', null, false, null, null, 1),
  ('location_note', 'paragraph', 'Where you''ll mostly be during Limicon.', null, false, null, null, 2),
  ('city', 'short', 'City', null, true, null, null, 3),
  ('region', 'short', 'State or province', null, false, null, null, 4),
  ('country', 'short', 'Country', null, true, null, null, 5),
  ('hopes_heading', 'headline', 'What you hope for', null, false, null, null, 6),
  ('hopes_note', 'paragraph', 'Answer any that speak to you. They help hosts and other members find you.', null, false, null, null, 7),
  ('session_wish', 'long', 'What session would you like to participate in?', null, false, null, null, 8),
  ('topic_wish', 'long', 'What topic would you like to learn more about?', null, false, null, null, 9),
  ('practice_wish', 'long', 'What practice would you like to get better at?', null, false, null, null, 10),
  ('conversation_wish', 'long', 'What conversation would you like to be a part of?', null, false, null, null, 11),
  ('meet_wish', 'long', 'Who would you like to meet?', null, false, null, null, 12),
  ('feeling_wish', 'long', 'How would you like to feel?', null, false, null, null, 13),
  ('hope', 'long', 'What do you wish will happen?', null, false, null, null, 14),
  ('contribution', 'long', 'What can you contribute?', null, false, null, null, 15),
  ('heard_about', 'long', 'How did you hear about Limicon?', null, false, null, null, 16),
  ('agreements_heading', 'headline', 'Agreements', null, false, null, null, 17),
  ('agree_code_of_conduct', 'checkbox', 'I agree to the Limicon Code of Conduct.', null, true, '/conduct', 'Read the Code of Conduct', 18),
  ('agree_privacy_policy', 'checkbox', 'I agree to the Limicon Privacy Policy.', null, true, '/privacy', 'Read the Privacy Policy', 19),
  ('confirm_contacts', 'checkbox', 'I''ll add team@limicon.org to my contacts so Limicon emails reach me.', null, true, null, null, 20),
  ('confirm_faq', 'checkbox', 'I''ll check the website and FAQ before emailing questions.', null, true, null, null, 21)
) as f (key, kind, label, help, required, link_url, link_text, sort_order);

-- Site documents admins edit without code, such as the Privacy Policy and Code of Conduct. A
-- document with no body yet shows the text that ships with the app.
create table public.site_documents (
  slug text primary key check (slug ~ '^[a-z][a-z0-9-]{0,39}$'),
  title text not null check (char_length(title) between 1 and 120),
  -- Rich text (TipTap JSON), rendered through an allowlist.
  body jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_documents enable row level security;

insert into public.site_documents (slug, title) values
  ('privacy', 'Privacy Policy'),
  ('conduct', 'Code of Conduct');
