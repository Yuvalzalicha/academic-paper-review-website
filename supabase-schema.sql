create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  subscription_status text not null default 'free' check (subscription_status in ('free', 'trialing', 'active', 'past_due', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  price_cents integer not null default 0,
  billing_interval text not null default 'month' check (billing_interval in ('free', 'month', 'year')),
  monthly_search_limit integer not null default 50,
  monthly_review_limit integer not null default 20,
  monthly_pdf_limit integer not null default 5,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (
  id,
  name,
  price_cents,
  billing_interval,
  monthly_search_limit,
  monthly_review_limit,
  monthly_pdf_limit,
  features
)
values
  ('free', 'Free', 0, 'free', 50, 20, 5, '["Cloud research library", "Basic recommendations", "Limited PDF dossiers"]'::jsonb),
  ('professional', 'Professional', 1900, 'month', 750, 300, 75, '["Higher usage limits", "Dossier history", "Priority PDF dossiers"]'::jsonb),
  ('lab', 'Lab', 4900, 'month', 3500, 1400, 350, '["Team usage", "Admin analytics", "Campaign attribution"]'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  billing_interval = excluded.billing_interval,
  monthly_search_limit = excluded.monthly_search_limit,
  monthly_review_limit = excluded.monthly_review_limit,
  monthly_pdf_limit = excluded.monthly_pdf_limit,
  features = excluded.features,
  updated_at = now();

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  subject_key text,
  user_id uuid references auth.users(id) on delete cascade,
  anonymous_session_id text,
  period date not null default date_trunc('month', now())::date,
  searches integer not null default 0,
  recommendations integer not null default 0,
  review_opens integer not null default 0,
  pdf_guides integer not null default 0,
  papers_saved integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.usage_counters
add column if not exists subject_key text;

update public.usage_counters
set subject_key = coalesce(user_id::text, 'anon:' || anonymous_session_id, 'anon:unknown')
where subject_key is null;

alter table public.usage_counters
alter column subject_key set not null;

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_session_id text,
  event_name text not null,
  event_properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'email' check (channel in ('email', 'social', 'content', 'partner')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  audience text,
  budget_cents integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id text not null,
  paper jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, paper_id)
);

create index if not exists app_events_name_created_at_idx on public.app_events (event_name, created_at desc);
create index if not exists usage_counters_period_idx on public.usage_counters (period desc);
create unique index if not exists usage_counters_subject_period_idx on public.usage_counters (subject_key, period);
create index if not exists user_subscriptions_status_idx on public.user_subscriptions (status);

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists subscription_plans_updated_at on public.subscription_plans;
create trigger subscription_plans_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

drop trigger if exists user_subscriptions_updated_at on public.user_subscriptions;
create trigger user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists usage_counters_updated_at on public.usage_counters;
create trigger usage_counters_updated_at
before update on public.usage_counters
for each row execute function public.set_updated_at();

drop trigger if exists marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger marketing_campaigns_updated_at
before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  insert into public.user_subscriptions (user_id, plan_id, status, provider)
  values (new.id, 'free', 'active', 'manual')
  on conflict (user_id, provider) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.user_profiles (id, email)
select id, email
from auth.users
on conflict (id) do update set email = excluded.email;

insert into public.user_subscriptions (user_id, plan_id, status, provider)
select id, 'free', 'active', 'manual'
from auth.users
on conflict (user_id, provider) do nothing;

create or replace function public.track_app_event(
  event_name text,
  event_properties jsonb default '{}'::jsonb,
  client_session_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_period date := date_trunc('month', now())::date;
  counter_column text;
  current_subject_key text := coalesce(auth.uid()::text, 'anon:' || coalesce(client_session_id, 'unknown'));
begin
  insert into public.app_events (user_id, anonymous_session_id, event_name, event_properties)
  values (auth.uid(), client_session_id, event_name, coalesce(event_properties, '{}'::jsonb));

  counter_column := case event_name
    when 'search_completed' then 'searches'
    when 'recommendations_completed' then 'recommendations'
    when 'review_opened' then 'review_opens'
    when 'pdf_guide_created' then 'pdf_guides'
    when 'paper_saved' then 'papers_saved'
    else null
  end;

  if counter_column is null then
    return;
  end if;

  insert into public.usage_counters (subject_key, user_id, anonymous_session_id, period)
  values (current_subject_key, auth.uid(), client_session_id, current_period)
  on conflict (subject_key, period) do nothing;

  execute format(
    'update public.usage_counters set %I = %I + 1, updated_at = now()
     where subject_key = $1 and period = $2',
    counter_column,
    counter_column
  )
  using current_subject_key, current_period;
end;
$$;

create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin role required';
  end if;

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'total_users', (select count(*) from public.user_profiles),
      'active_subscriptions', (
        select count(*)
        from public.user_subscriptions
        where status in ('trialing', 'active')
      ),
      'events_30_days', (
        select count(*)
        from public.app_events
        where created_at >= now() - interval '30 days'
      ),
      'saved_papers', (select count(*) from public.saved_papers),
      'pdf_guides', (select coalesce(sum(pdf_guides), 0) from public.usage_counters),
      'campaigns', (select count(*) from public.marketing_campaigns)
    ),
    'usage', (
      select coalesce(jsonb_agg(row_to_json(row_data) order by row_data.period desc, row_data.email), '[]'::jsonb)
      from (
        select
          coalesce(up.email, uc.anonymous_session_id, 'Anonymous') as email,
          to_char(uc.period, 'YYYY-MM') as period,
          uc.searches,
          uc.recommendations,
          uc.review_opens,
          uc.pdf_guides,
          uc.papers_saved
        from public.usage_counters uc
        left join public.user_profiles up on up.id = uc.user_id
        order by uc.period desc, uc.updated_at desc
        limit 25
      ) row_data
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(row_to_json(row_data) order by row_data.created_at desc), '[]'::jsonb)
      from (
        select
          up.email,
          sp.name as plan_name,
          us.status,
          us.current_period_end,
          us.created_at
        from public.user_subscriptions us
        left join public.user_profiles up on up.id = us.user_id
        left join public.subscription_plans sp on sp.id = us.plan_id
        order by us.created_at desc
        limit 25
      ) row_data
    ),
    'events', (
      select coalesce(jsonb_agg(row_to_json(row_data) order by row_data.total desc), '[]'::jsonb)
      from (
        select
          event_name,
          count(*) as total,
          max(created_at) as last_seen_at
        from public.app_events
        where created_at >= now() - interval '30 days'
        group by event_name
        order by total desc
        limit 20
      ) row_data
    ),
    'campaigns', (
      select coalesce(jsonb_agg(row_to_json(row_data) order by row_data.created_at desc), '[]'::jsonb)
      from (
        select
          id,
          name,
          channel,
          status,
          created_at
        from public.marketing_campaigns
        order by created_at desc
        limit 20
      ) row_data
    )
  )
  into payload;

  return payload;
end;
$$;

alter table public.user_profiles enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.app_events enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.saved_papers enable row level security;

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin());

drop policy if exists "Admins can update profiles" on public.user_profiles;
create policy "Admins can update profiles"
on public.user_profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Anyone can read active plans" on public.subscription_plans;
create policy "Anyone can read active plans"
on public.subscription_plans
for select
to anon, authenticated
using (is_active or public.is_admin());

drop policy if exists "Admins can manage plans" on public.subscription_plans;
create policy "Admins can manage plans"
on public.subscription_plans
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can read their own subscriptions" on public.user_subscriptions;
create policy "Users can read their own subscriptions"
on public.user_subscriptions
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admins can manage subscriptions" on public.user_subscriptions;
create policy "Admins can manage subscriptions"
on public.user_subscriptions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can read their own usage" on public.usage_counters;
create policy "Users can read their own usage"
on public.usage_counters
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admins can read events" on public.app_events;
create policy "Admins can read events"
on public.app_events
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can manage campaigns" on public.marketing_campaigns;
create policy "Admins can manage campaigns"
on public.marketing_campaigns
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can read their own saved papers" on public.saved_papers;
create policy "Users can read their own saved papers"
on public.saved_papers
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can save their own papers" on public.saved_papers;
create policy "Users can save their own papers"
on public.saved_papers
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own saved papers" on public.saved_papers;
create policy "Users can update their own saved papers"
on public.saved_papers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own saved papers" on public.saved_papers;
create policy "Users can delete their own saved papers"
on public.saved_papers
for delete
to authenticated
using (auth.uid() = user_id);

grant execute on function public.track_app_event(text, jsonb, text) to anon, authenticated;
grant execute on function public.get_admin_dashboard() to authenticated;

-- After running this schema, promote your own account once:
-- update public.user_profiles set role = 'admin' where email = 'you@example.com';
