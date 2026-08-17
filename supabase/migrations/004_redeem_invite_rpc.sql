-- ============================================================
-- Suchi Grocery App — Database RPC for Invite Redemption
-- Migration 004: Direct & Secure Postgres RPC for Joining Households
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

create or replace function public.redeem_household_invite(p_invite_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_invite record;
  v_existing_member record;
  v_other_membership record;
  v_household record;
begin
  -- 1. Must be authenticated
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('error', 'Authentication required. Please sign in first.');
  end if;

  -- 2. Find invite by clean code
  select id, household_id, expires_at, used_by
  into v_invite
  from public.household_invites
  where invite_code = trim(p_invite_code);

  if not found then
    return json_build_object('error', 'Invite code not found. Please verify the code or link.');
  end if;

  -- 3. Check expiration
  if v_invite.expires_at < now() then
    return json_build_object('error', 'This invite link has expired.');
  end if;

  -- 4. Check already used
  if v_invite.used_by is not null then
    return json_build_object('error', 'This invite has already been used.');
  end if;

  -- 5. Check if already a member of this household (idempotent success)
  select id into v_existing_member
  from public.household_members
  where household_id = v_invite.household_id
    and user_id = v_user_id;

  if found then
    select id, name into v_household
    from public.households
    where id = v_invite.household_id;

    return json_build_object(
      'household_id', v_household.id,
      'household_name', v_household.name
    );
  end if;

  -- 6. Check if user is already in another household
  select household_id into v_other_membership
  from public.household_members
  where user_id = v_user_id;

  if found then
    return json_build_object('error', 'You are already a member of a household. Leave your current household first.');
  end if;

  -- 7. Insert member row
  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, v_user_id, 'member');

  -- 8. Mark invite as used
  update public.household_invites
  set used_by = v_user_id
  where id = v_invite.id;

  -- 9. Return household info
  select id, name into v_household
  from public.households
  where id = v_invite.household_id;

  return json_build_object(
    'household_id', v_household.id,
    'household_name', v_household.name
  );
end;
$$;

-- Grant execution to authenticated users
grant execute on function public.redeem_household_invite(text) to authenticated;
