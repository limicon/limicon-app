-- A member's bio (docs/feature-profiles.md, PRD PRO-1): plain text in paragraphs, up to 1,000 words,
-- which app/lib/profile-form.ts checks. The character cap here only stops oversized writes.
alter table public.profiles
  add column bio text check (char_length(bio) <= 10000);
