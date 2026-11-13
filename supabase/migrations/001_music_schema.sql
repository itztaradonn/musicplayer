-- Music player schema. Safe to run more than once, and safe on a project that already
-- has a `tracks` table from before the YouTube feature (the new columns are just added).
-- Apply via the Supabase SQL editor, or `supabase db push`.

-- ---------------------------------------------------------------- tracks
create table if not exists public.tracks (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  name           text not null,
  file_path      text not null unique,   -- object path inside the "music" bucket
  artist         text,                   -- channel / artist name
  artwork_path   text,                   -- cover image path inside the "music" bucket (covers/...)
  duration       real,                   -- seconds
  source_url     text,                   -- the YouTube link it was imported from
  lyrics         text,                   -- LRC (synced) or plain text
  lyrics_source  text check (lyrics_source in ('auto', 'manual'))
);

-- Upgrade path for a table created before the YouTube feature
alter table public.tracks
  add column if not exists artist        text,
  add column if not exists artwork_path  text,
  add column if not exists duration      real,
  add column if not exists source_url    text,
  add column if not exists lyrics        text,
  add column if not exists lyrics_source text check (lyrics_source in ('auto', 'manual'));

create index if not exists tracks_created_at_idx on public.tracks (created_at);

-- ---------------------------------------------------------------- row level security
-- The player has no login, so the website (anon key) reads, adds and deletes tracks directly.
-- There is deliberately NO update policy: lyrics are written by the import server, which uses
-- the service_role key and bypasses RLS.
alter table public.tracks enable row level security;

drop policy if exists "tracks are readable"    on public.tracks;
drop policy if exists "tracks can be added"    on public.tracks;
drop policy if exists "tracks can be removed"  on public.tracks;

create policy "tracks are readable"   on public.tracks for select to anon, authenticated using (true);
create policy "tracks can be added"   on public.tracks for insert to anon, authenticated with check (true);
create policy "tracks can be removed" on public.tracks for delete to anon, authenticated using (true);

-- Tables made with SQL are not always exposed to the Data API automatically
grant select, insert, delete on public.tracks to anon, authenticated;

-- ---------------------------------------------------------------- storage
-- Public bucket: songs and covers are played from plain URLs. Only MP3 and JPEG, 50 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music', 'music', true, 52428800, array['audio/mpeg', 'image/jpeg'])
on conflict (id) do nothing;

-- Deleting needs the select policy too (Postgres applies SELECT rules to a DELETE's WHERE clause).
drop policy if exists "music files are listable"   on storage.objects;
drop policy if exists "music files can be added"   on storage.objects;
drop policy if exists "music files can be removed" on storage.objects;

create policy "music files are listable"   on storage.objects for select to anon, authenticated using (bucket_id = 'music');
create policy "music files can be added"   on storage.objects for insert to anon, authenticated with check (bucket_id = 'music');
create policy "music files can be removed" on storage.objects for delete to anon, authenticated using (bucket_id = 'music');
