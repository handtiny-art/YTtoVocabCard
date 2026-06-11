-- YTtoVocab schema: video_sets + flashcards (per-user, RLS enforced)
-- WARNING: This drops and recreates the flashcards table.
-- Back up any existing data in `flashcards` before running this.

drop table if exists public.flashcards;
drop table if exists public.video_sets;

create table public.video_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null,
  transcript text,
  created_at timestamptz not null default now()
);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.video_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  part_of_speech text default 'n/a',
  translation text default '',
  example_sentence text default '',
  english_definition text default '',
  cefr_level text default 'B2',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.video_sets enable row level security;
alter table public.flashcards enable row level security;

create policy "own video sets" on public.video_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own flashcards" on public.flashcards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Verification: run after the above to confirm RLS is active
-- 1) Expect relrowsecurity = true for both tables
select relname, relrowsecurity from pg_class where relname in ('video_sets', 'flashcards');

-- 2) Expect one policy per table
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('video_sets','flashcards');
