-- The Community page (docs/feature-community.md): a group feed where any member posts, likes and
-- comments. Like every table, RLS is enabled with no policies.
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  -- An optional photo in the media bucket (app/lib/media.ts).
  image_key text check (image_key ~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|gif|webp)$'),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

alter table public.community_posts enable row level security;

create index community_posts_newest on public.community_posts (created_at desc);
create index community_posts_by_author on public.community_posts (author_id, created_at desc);

create table public.community_post_likes (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table public.community_post_likes enable row level security;

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

alter table public.community_comments enable row level security;

create index community_comments_by_post on public.community_comments (post_id, created_at);
create index community_comments_by_author on public.community_comments (author_id, created_at desc);
