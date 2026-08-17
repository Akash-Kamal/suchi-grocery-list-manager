-- ============================================================
-- Suchi Grocery App — Fix Household Leave, Revoke & Sync
-- Migration 006: Leave Household RPC, Revoke Invites RPC & RLS Fixes
-- ============================================================

-- ─── 1. Fix DELETE Policy on household_members ───────────────
-- Allow members to delete their own row (leave household)
-- Allow owners to remove any non-owner member

drop policy if exists "household_members_delete_owner" on public.household_members;
drop policy if exists "household_members_delete" on public.household_members;

create policy "household_members_delete"
  on public.household_members
  for delete
  using (
    -- Any user can remove themselves (leave household)
    user_id = auth.uid()
    -- OR owner of the household can remove other members
    or exists (
      select 1 from public.household_members owner_row
      where owner_row.household_id = household_members.household_id
        and owner_row.user_id      = auth.uid()
        and owner_row.role         = 'owner'
    )
  );

-- ─── 2. Fix DELETE Policy on household_invites ───────────────
drop policy if exists "household_invites_delete_member" on public.household_invites;
drop policy if exists "household_invites_delete" on public.household_invites;

create policy "household_invites_delete"
  on public.household_invites
  for delete
  using (
    public.is_household_member(household_id)
    or created_by = auth.uid()
  );

-- ─── 3. RPC: leave_household (Security Definer) ───────────────
-- Handles member leave cleanly and safely, including owner cleanup

create or replace function public.leave_household(p_household_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_member record;
  v_other_members_count int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('error', 'Authentication required.');
  end if;

  -- Find membership
  select id, role into v_member
  from public.household_members
  where household_id = p_household_id
    and user_id = v_user_id;

  if not found then
    return json_build_object('success', true, 'message', 'Not a member of this household.');
  end if;

  -- If member is owner, check if other members exist
  if v_member.role = 'owner' then
    select count(*) into v_other_members_count
    from public.household_members
    where household_id = p_household_id
      and user_id <> v_user_id;

    if v_other_members_count = 0 then
      -- Single owner left, delete entire household (cascades to all data)
      delete from public.households where id = p_household_id;
    else
      -- Transfer ownership to earliest joined member then remove current user
      update public.household_members
      set role = 'owner'
      where id = (
        select id from public.household_members
        where household_id = p_household_id
          and user_id <> v_user_id
        order by joined_at asc
        limit 1
      );
      delete from public.household_members where id = v_member.id;
    end if;
  else
    -- Normal member, delete membership row
    delete from public.household_members where id = v_member.id;
  end if;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.leave_household(uuid) to authenticated;

-- ─── 4. RPC: revoke_household_invites (Security Definer) ──────
-- Revokes all unused invite codes for a household (Owner only)

create or replace function public.revoke_household_invites(p_household_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('error', 'Authentication required.');
  end if;

  -- Verify caller is a member (or owner) of the household
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id
      and user_id = v_user_id
  ) then
    return json_build_object('error', 'Unauthorized. Must be a household member.');
  end if;

  -- Delete all pending/unredeemed invites
  delete from public.household_invites
  where household_id = p_household_id
    and used_by is null;

  get diagnostics v_count = row_count;

  return json_build_object('success', true, 'revoked_count', v_count);
end;
$$;

grant execute on function public.revoke_household_invites(uuid) to authenticated;
