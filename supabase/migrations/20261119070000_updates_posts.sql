-- The Members area's Updates page (docs/feature-updates.md): posts by people whose role has the
-- `updates` privilege, and likes and comments by members. Comment edits are kept so the
-- Organizing Team is told when a comment changes. Like every table, RLS is enabled with no
-- policies.
create table public.update_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  body jsonb not null,
  -- The template the post started from, such as 'newsletter', or null for one written from scratch.
  template text,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

alter table public.update_posts enable row level security;

-- The page lists posts newest first.
create index update_posts_newest on public.update_posts (created_at desc);

create table public.update_post_likes (
  post_id uuid not null references public.update_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table public.update_post_likes enable row level security;

create table public.update_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.update_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

alter table public.update_comments enable row level security;

create index update_comments_by_post on public.update_comments (post_id, created_at);

-- Each edit of a comment, with the text before and after, until someone on the team marks it
-- reviewed.
create table public.update_comment_edits (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.update_comments (id) on delete cascade,
  previous_body text not null,
  new_body text not null,
  edited_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);

alter table public.update_comment_edits enable row level security;

create index update_comment_edits_unreviewed on public.update_comment_edits (edited_at) where reviewed_at is null;
