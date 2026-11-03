-- Simple Karte: where the demo's records are kept (fictional test patients only).
-- Run once in the Supabase SQL editor of the project. No keys are stored in this repository: the app
-- reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from the environment.
--
-- One row per workspace (a random id the browser makes; a link with ?ws=<id> opens the same records on
-- another device). The table is closed to the public key: the browser can only call the three
-- functions below with an id it already knows; it cannot list or read other workspaces.

create table if not exists public.workspaces (
  id uuid primary key,
  version integer not null,
  day date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint workspaces_size check (octet_length(data::text) < 5000000)
);

alter table public.workspaces enable row level security;
revoke all on table public.workspaces from anon, authenticated;

create or replace function public.save_workspace(p_id uuid, p_version integer, p_day date, p_data jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workspaces (id, version, day, data, updated_at)
  values (p_id, p_version, p_day, p_data, now())
  on conflict (id) do update set version = excluded.version, day = excluded.day, data = excluded.data, updated_at = now();
$$;

create or replace function public.load_workspace(p_id uuid)
returns table (version integer, day date, data jsonb, updated_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select w.version, w.day, w.data, w.updated_at from public.workspaces w where w.id = p_id;
$$;

create or replace function public.reset_workspace(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.workspaces where id = p_id;
$$;

revoke all on function public.save_workspace(uuid, integer, date, jsonb) from public;
revoke all on function public.load_workspace(uuid) from public;
revoke all on function public.reset_workspace(uuid) from public;
grant execute on function public.save_workspace(uuid, integer, date, jsonb) to anon, authenticated;
grant execute on function public.load_workspace(uuid) to anon, authenticated;
grant execute on function public.reset_workspace(uuid) to anon, authenticated;
