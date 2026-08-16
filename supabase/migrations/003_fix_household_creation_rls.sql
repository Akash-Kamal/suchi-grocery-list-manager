-- ============================================================
-- Suchi Grocery App — Fix Household Creation RLS Policies
-- Migration 003: Fix Household Creation & Creator Access
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Allow household creators to SELECT their created household (needed for .select().single())
drop policy if exists "households_select_member" on public.households;

create policy "households_select_member"
  on public.households
  for select
  using (
    created_by = auth.uid()
    or public.is_household_member(id)
  );

-- 2. Allow creators to insert themselves as the initial 'owner' into household_members
drop policy if exists "household_members_insert_owner" on public.household_members;

create policy "household_members_insert_owner"
  on public.household_members
  for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.households h
      where h.id = household_id
        and h.created_by = auth.uid()
    )
  );

-- 3. Allow members to SELECT rows where they are the user or part of the household
drop policy if exists "household_members_select_member" on public.household_members;

create policy "household_members_select_member"
  on public.household_members
  for select
  using (
    user_id = auth.uid()
    or public.is_household_member(household_id)
  );
