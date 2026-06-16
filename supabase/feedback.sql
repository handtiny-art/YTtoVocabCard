create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  rating     integer not null check (rating >= 1 and rating <= 5),
  comment    text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "users can insert own feedback" on public.feedback
  for insert with check (auth.uid() = user_id);
