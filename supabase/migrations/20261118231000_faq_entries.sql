-- The public FAQ page (PUB-1), which admins write and update in the console as questions come
-- in. Entries aren't tied to an edition: answers carry over from year to year until an admin
-- changes them. Like every table, RLS is enabled with no policies.
create table public.faq_entries (
  id bigint generated always as identity primary key,
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 10000),
  -- Unpublished entries are drafts, seen only in the console.
  published boolean not null default false,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faq_entries enable row level security;

create index faq_entries_order on public.faq_entries (sort_order, id);
