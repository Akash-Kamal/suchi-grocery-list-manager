-- ============================================================
-- Suchi Grocery App — Robust Household Engine & Realtime
-- Migration 008: Atomic Household Creation, Member Query & Full Realtime
-- ============================================================

-- ─── 1. Ensure Full Replica Identity on All Shared Tables ────
alter table if exists public.households replica identity full;
alter table if exists public.household_members replica identity full;
alter table if exists public.household_invites replica identity full;
alter table if exists public.grocery_lists replica identity full;
alter table if exists public.list_items replica identity full;

-- ─── 2. Add household_members to supabase_realtime publication ──
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_members'
  ) then
    alter publication supabase_realtime add table public.household_members;
  end if;
end $$;

-- ─── 3. Atomic create_household RPC (Security Definer) ────────
-- Replaces client-side 2-step inserts with single atomic transaction
create or replace function public.create_household(p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_clean_name text;
  v_household record;
  v_member record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('error', 'Authentication required.');
  end if;

  v_clean_name := trim(p_name);
  if length(v_clean_name) = 0 then
    return json_build_object('error', 'Household name cannot be blank.');
  end if;

  -- 1. Leave any existing household membership cleanly
  perform public.leave_current_household();

  -- 2. Insert new household row
  insert into public.households (name, created_by)
  values (v_clean_name, v_user_id)
  returning * into v_household;

  -- 3. Insert creator as owner member
  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, v_user_id, 'owner')
  returning * into v_member;

  return json_build_object(
    'household_id', v_household.id,
    'household_name', v_household.name,
    'membership_id', v_member.id,
    'role', v_member.role,
    'joined_at', v_member.joined_at
  );
end;
$$;

grant execute on function public.create_household(text) to authenticated;

-- ─── 4. RPC: get_household_members (with User Details) ────────
-- Securely returns member emails & display names for household members
create or replace function public.get_household_members(p_household_id uuid)
returns table (
  id uuid,
  household_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  email text,
  display_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.id,
    m.household_id,
    m.user_id,
    m.role::text,
    m.joined_at,
    u.email::text,
    coalesce(
      (u.raw_user_meta_data->>'full_name')::text,
      split_part(u.email::text, '@', 1)
    ) as display_name
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = p_household_id
    -- Only members of the household or the user themselves can execute
    and (public.is_household_member(p_household_id) or auth.uid() = m.user_id)
  order by m.joined_at asc;
$$;

grant execute on function public.get_household_members(uuid) to authenticated;
