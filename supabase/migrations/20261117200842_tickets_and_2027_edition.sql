-- Tickets: a ticket for an edition is what opens that edition's Members area. Like every table,
-- RLS is enabled with no policies; server code reads and writes them through Hyperdrive.

-- The ticket tiers on sale for an edition (REG-3). All tiers give the same access.
create table public.ticket_tiers (
  id bigint generated always as identity primary key,
  edition_id bigint not null references public.editions (id) on delete cascade,
  name text not null,
  -- US cents: Stripe Checkout charges in USD.
  price_cents integer not null check (price_cents >= 0),
  sort_order integer not null default 0,
  unique (edition_id, name)
);

alter table public.ticket_tiers enable row level security;

-- A person's registration for an edition (REG-6). `comp` covers tickets admins issue without
-- payment (REG-9) and 100% discount codes (REG-5); `imported` marks past ticket holders moved
-- in from the old site (MIG-2).
create table public.tickets (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  edition_id bigint not null references public.editions (id),
  tier_id bigint references public.ticket_tiers (id),
  status text not null check (status in ('paid', 'comp', 'refunded')),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  stripe_checkout_session_id text unique,
  imported boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tickets enable row level security;

-- One ticket per person per edition, not counting refunded ones.
create unique index tickets_one_per_person_per_edition
  on public.tickets (profile_id, edition_id)
  where status <> 'refunded';

-- The current edition is the one with the latest year. Its dates and tiers come later.
insert into public.editions (year) values (2027);
