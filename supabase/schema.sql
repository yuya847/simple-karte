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

-- 同時利用（排他制御・同時利用の警告）: optional. Run this part too to let devices see each other: each open tab
-- says every 10 seconds which chart it has open (fictional staff names and patient ids only) and hears about
-- the other tabs of the same workspace and who saved the records last. Without it, the app still warns about
-- the other tabs of the same browser. Rows older than 10 minutes are removed on each call.
create table if not exists public.workspace_presence (
  ws uuid not null,
  tab text not null,
  who text not null,
  role text not null,
  patient text,
  editing boolean not null default false,
  seen timestamptz not null default now(),
  primary key (ws, tab),
  constraint presence_sizes check (char_length(tab) <= 80 and char_length(who) <= 80 and char_length(role) <= 16 and coalesce(char_length(patient), 0) <= 80)
);

alter table public.workspace_presence enable row level security;
revoke all on table public.workspace_presence from anon, authenticated;

create or replace function public.touch_presence(p_ws uuid, p_tab text, p_who text, p_role text, p_patient text, p_editing boolean)
returns table (tab text, who text, role text, patient text, editing boolean, ws_updated timestamptz, ws_writer text, ws_by text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  delete from public.workspace_presence p where p.seen < now() - interval '10 minutes';
  insert into public.workspace_presence as p (ws, tab, who, role, patient, editing, seen)
  values (p_ws, p_tab, p_who, p_role, p_patient, coalesce(p_editing, false), now())
  on conflict on constraint workspace_presence_pkey do update set who = excluded.who, role = excluded.role, patient = excluded.patient, editing = excluded.editing, seen = now();
  return query
    select o.tab, o.who, o.role, o.patient, o.editing, w.updated_at, w.data -> '__writer' ->> 'tab', w.data -> '__writer' ->> 'by'
    from (select 1) as one
    left join public.workspace_presence o on o.ws = p_ws and o.tab <> p_tab and o.seen > now() - interval '30 seconds'
    left join public.workspaces w on w.id = p_ws;
end;
$$;

revoke all on function public.touch_presence(uuid, text, text, text, text, boolean) from public;
grant execute on function public.touch_presence(uuid, text, text, text, text, boolean) to anon, authenticated;
