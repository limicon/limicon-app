-- The public website's pages, which admins build from sections and edit without code (PUB-1,
-- PUB-2), on the page itself or in the console. Like every table, RLS is enabled with no
-- policies; server code reads and writes them through Hyperdrive.
create table public.site_pages (
  id bigint generated always as identity primary key,
  -- The address: `home` is the front page at /, and every other page is at /<slug>.
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  title text not null check (char_length(title) between 1 and 120),
  -- The page's name in the site menu, when it differs from its title.
  menu_label text check (char_length(menu_label) <= 40),
  in_menu boolean not null default true,
  -- Unpublished pages are drafts only admins can open.
  published boolean not null default false,
  sort_order integer not null default 0,
  -- The page's sections in order, each cleaned on save (app/lib/site-pages.ts).
  sections jsonb not null default '[]',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_pages enable row level security;

-- The front page starts with the event: its image, name, teaser, dates and About, which admins
-- edit on the console's Edit page.
insert into public.site_pages (slug, title, in_menu, published, sort_order, sections)
values ('home', 'Home', false, true, 0, '[{"id": "event", "type": "event"}]');
