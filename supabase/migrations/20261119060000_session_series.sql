-- Repeating sessions. A host who picks weekly, every two weeks or other dates gets one full
-- session per date, each with its own RSVPs, capacity and status; series_id links them so their
-- pages can list the other dates. Sessions that don't repeat have none.
alter table public.sessions add column series_id uuid;

create index sessions_by_series on public.sessions (series_id) where series_id is not null;
