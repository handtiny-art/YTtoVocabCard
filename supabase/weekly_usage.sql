-- Tracks per-user weekly conversion quota.
-- Written only by server (service role). Users can read their own row.

create table if not exists public.weekly_usage (
  user_id   uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  conversion_count  integer not null default 0,
  exceeded_attempts integer not null default 0,
  primary key (user_id, week_start)
);

alter table public.weekly_usage enable row level security;

create policy "users can read own usage" on public.weekly_usage
  for select using (auth.uid() = user_id);
