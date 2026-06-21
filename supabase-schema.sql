create table if not exists public.saved_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id text not null,
  paper jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, paper_id)
);

alter table public.saved_papers enable row level security;

create policy "Users can read their own saved papers"
on public.saved_papers
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can save their own papers"
on public.saved_papers
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own saved papers"
on public.saved_papers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own saved papers"
on public.saved_papers
for delete
to authenticated
using (auth.uid() = user_id);
