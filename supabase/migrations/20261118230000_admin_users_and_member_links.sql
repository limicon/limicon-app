-- The admin console's Users page and editable member links. Like every table, RLS is enabled with
-- no policies; server code reads and writes them through Hyperdrive.

-- Links shown to members for an edition (MEM-2), such as the Miro board and Castalia. Admins add,
-- rename, reorder and remove them in the console's Settings page.
create table public.edition_links (
  id bigint generated always as identity primary key,
  edition_id bigint not null references public.editions (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  url text not null check (url ~ '^https://'),
  sort_order integer not null default 0
);

alter table public.edition_links enable row level security;

create index edition_links_by_edition on public.edition_links (edition_id, sort_order);

insert into public.edition_links (edition_id, label, url, sort_order)
select id, 'Miro', miro_url, 0 from public.editions where miro_url is not null
union all
select id, 'Castalia', castalia_url, 1 from public.editions where castalia_url is not null;

alter table public.editions drop column miro_url, drop column castalia_url;

-- A deactivated account keeps its data but can't open the Members area or the admin console
-- (MSG-4). Null means active.
alter table public.profiles add column deactivated_at timestamptz;

-- Private notes admins keep about a person, seen only in the console.
create table public.admin_user_notes (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

alter table public.admin_user_notes enable row level security;

create index admin_user_notes_by_profile on public.admin_user_notes (profile_id, created_at desc);
