-- Members' profiles (docs/feature-profiles.md): the top of the page, links with a platform each,
-- skills and interests as shared keywords, and projects. Other members see them; profiles are
-- never public. Like every table, RLS is enabled with no policies.
alter table public.profiles
  add column headline text check (char_length(headline) <= 150),
  add column location text check (char_length(location) <= 100),
  add column business_name text check (char_length(business_name) <= 150),
  add column titles text[] not null default '{}' check (cardinality(titles) <= 5),
  -- Whether the profile shows their sign-in email. Off unless they turn it on.
  add column show_email boolean not null default false;

-- Up to 10 links per member, in their order. `value` is what they typed: a full address for a
-- website, or an address, @handle or username for a platform (app/lib/profile-links.ts).
create table public.profile_links (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform ~ '^[a-z]{1,20}$'),
  value text not null check (char_length(value) between 1 and 300),
  position smallint not null check (position between 0 and 9),
  unique (profile_id, position)
);

alter table public.profile_links enable row level security;

-- Skills and interests, typed freely. `key` is the lower-cased form, so members who type "Permaculture"
-- and "permaculture" share one keyword.
create table public.profile_keywords (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('skill', 'interest')),
  keyword text not null check (char_length(keyword) between 1 and 40),
  key text not null check (key = lower(keyword)),
  position smallint not null,
  primary key (profile_id, kind, key)
);

alter table public.profile_keywords enable row level security;

create index profile_keywords_by_key on public.profile_keywords (key);

-- What members are working on: a few keywords and a description each.
create table public.profile_projects (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  keywords text not null check (char_length(keywords) between 1 and 150),
  description text not null default '' check (char_length(description) <= 3000),
  position smallint not null check (position between 0 and 4),
  unique (profile_id, position)
);

alter table public.profile_projects enable row level security;

-- Recent activity reads a member's own posts and comments, newest first.
create index update_comments_by_author on public.update_comments (author_id, created_at desc);
create index update_posts_by_author on public.update_posts (author_id, created_at desc);
