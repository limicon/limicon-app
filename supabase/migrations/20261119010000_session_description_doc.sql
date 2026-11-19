-- Hosts format a session's description (bold, lists, links) in a rich text editor. The document
-- is kept as cleaned TipTap JSON in description_doc; description keeps its plain text, which the
-- schedule's search matches and calendar feeds can carry.
alter table public.sessions add column description_doc jsonb;
