-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Existing tracks are untouched (new columns are NULL).

alter table public.tracks
  add column if not exists artist        text,   -- channel / artist name
  add column if not exists artwork_path  text,   -- cover image path inside the "music" bucket (covers/...)
  add column if not exists duration      real,   -- seconds
  add column if not exists source_url    text,   -- the YouTube link it was imported from
  add column if not exists lyrics        text,   -- LRC (synced) or plain text
  add column if not exists lyrics_source text;   -- 'auto' | 'manual'

-- The import server uses the service-role key, which bypasses row level security,
-- so no extra policies are needed for it. The player itself only reads these columns.
