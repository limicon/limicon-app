-- A photo for each session, and a profile picture for each member. Both hold the key of an image
-- in the media bucket (app/lib/media.ts), never an address, so they can only point at our own
-- uploads. Schedules fall back from a session's photo to its host's picture, then to the logo.
alter table public.sessions
  add column image_key text
    constraint sessions_image_key_is_image check (image_key ~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|gif|webp)$');

alter table public.profiles
  add column avatar_key text
    constraint profiles_avatar_key_is_image check (avatar_key ~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|gif|webp)$');
