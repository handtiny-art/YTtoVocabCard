-- Shared cache of transcripts + AI vocabulary results, keyed by YouTube video ID.
-- Lets multiple users re-use the same Supadata/Gemini result for the same video,
-- avoiding repeated API calls/costs. Written only by the server (service role key),
-- readable by anyone.

create table if not exists public.video_cache (
  video_id text primary key,
  title text,
  transcript text,
  summary text,
  vocabulary jsonb,
  updated_at timestamptz not null default now()
);

alter table public.video_cache enable row level security;

create policy "anyone can read video cache" on public.video_cache
  for select using (true);
