-- ============================================================
-- Suchi Grocery App — Supabase RLS Policies
-- Migration 002: Row Level Security
--
-- Run this AFTER 001_initial_schema.sql
-- ============================================================

-- ─── Helper: is_household_member ─────────────────────────────────────────────
-- Returns true if the currently authenticated user is a member of p_household_id.
-- SECURITY DEFINER so it can safely read household_members even from within a policy.
-- STABLE so the query planner can cache the result per transaction.

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

-- ─── Helper: my_household_id ──────────────────────────────────────────────────
-- Returns the household_id of the current user (assumes one household per user).
-- Returns NULL if user is not in any household.

create or replace function public.my_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid()
  limit 1;
$$;

-- ─── Enable RLS on every table ────────────────────────────────────────────────

alter table public.households              enable row level security;
alter table public.household_members       enable row level security;
alter table public.household_invites       enable row level security;
alter table public.categories              enable row level security;
alter table public.catalog_items           enable row level security;
alter table public.item_aliases            enable row level security;
alter table public.grocery_lists           enable row level security;
alter table public.list_items              enable row level security;
alter table public.favorites               enable row level security;
alter table public.recurring_item_stats    enable row level security;
alter table public.shopping_sessions       enable row level security;
alter table public.shopping_session_events enable row level security;
alter table public.user_preferences        enable row level security;

-- ─── households ───────────────────────────────────────────────────────────────

-- Members and creators can read their household
create policy "households_select_member"
  on public.households
  for select
  using (
    created_by = auth.uid()
    or public.is_household_member(id)
  );

-- Any authenticated user can create a household (they become its owner)
create policy "households_insert_any_auth"
  on public.households
  for insert
  with check (auth.uid() = created_by);

-- Only owners can update the household name
create policy "households_update_owner_only"
  on public.households
  for update
  using (
    exists (
      select 1 from public.household_members
      where household_id  = households.id
        and user_id       = auth.uid()
        and role          = 'owner'
    )
  );

-- Household cannot be deleted by clients (only via cascade when owner account is deleted)

-- ─── household_members ────────────────────────────────────────────────────────

-- Members can see who else is in their household
create policy "household_members_select_member"
  on public.household_members
  for select
  using (
    user_id = auth.uid()
    or public.is_household_member(household_id)
  );

-- Creator can insert their own owner membership row
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

-- Only owners can remove members (but not themselves — handled at app layer)
create policy "household_members_delete_owner"
  on public.household_members
  for delete
  using (
    exists (
      select 1 from public.household_members owner_row
      where owner_row.household_id = household_members.household_id
        and owner_row.user_id      = auth.uid()
        and owner_row.role         = 'owner'
    )
    -- Prevent owner from accidentally deleting themselves via the UI
    and user_id <> auth.uid()
  );

-- ─── household_invites ────────────────────────────────────────────────────────

-- Any member of the household can read invites (to copy the link)
create policy "household_invites_select_member"
  on public.household_invites
  for select
  using (public.is_household_member(household_id));

-- Any member can generate a new invite for their own household
create policy "household_invites_insert_member"
  on public.household_invites
  for insert
  with check (
    public.is_household_member(household_id)
    and auth.uid() = created_by
  );

-- Invite deletion (revocation) by any household member
create policy "household_invites_delete_member"
  on public.household_invites
  for delete
  using (public.is_household_member(household_id));

-- Marking used_by is done by Edge Function (service role key), not client directly.
-- A non-member reading an invite code to redeem it is handled by the Edge Function.

-- ─── categories ───────────────────────────────────────────────────────────────

-- Categories are global read-only reference data. Any authenticated user can read.
create policy "categories_select_authenticated"
  on public.categories
  for select
  using (auth.uid() is not null);

-- No INSERT/UPDATE/DELETE from clients — only modified via migrations.

-- ─── catalog_items ────────────────────────────────────────────────────────────

-- Read: global items (household_id IS NULL) or own-household custom items
create policy "catalog_items_select"
  on public.catalog_items
  for select
  using (
    household_id is null
    or public.is_household_member(household_id)
  );

-- Insert: only household-scoped custom items, by own-household members
create policy "catalog_items_insert_custom"
  on public.catalog_items
  for insert
  with check (
    household_id is not null
    and public.is_household_member(household_id)
    and is_custom = true
  );

-- Update: only own-household custom items
create policy "catalog_items_update_custom"
  on public.catalog_items
  for update
  using (
    household_id is not null
    and public.is_household_member(household_id)
  )
  with check (
    household_id is not null
    and public.is_household_member(household_id)
  );

-- Delete: only own-household custom items
create policy "catalog_items_delete_custom"
  on public.catalog_items
  for delete
  using (
    household_id is not null
    and public.is_household_member(household_id)
  );

-- ─── item_aliases ─────────────────────────────────────────────────────────────

-- Read aliases for global items + own-household items
create policy "item_aliases_select"
  on public.item_aliases
  for select
  using (
    exists (
      select 1 from public.catalog_items ci
      where ci.id = catalog_item_id
        and (
          ci.household_id is null
          or public.is_household_member(ci.household_id)
        )
    )
  );

-- ─── grocery_lists ────────────────────────────────────────────────────────────

create policy "grocery_lists_select"
  on public.grocery_lists
  for select
  using (public.is_household_member(household_id));

create policy "grocery_lists_insert"
  on public.grocery_lists
  for insert
  with check (public.is_household_member(household_id));

create policy "grocery_lists_update"
  on public.grocery_lists
  for update
  using (public.is_household_member(household_id));

create policy "grocery_lists_delete"
  on public.grocery_lists
  for delete
  using (public.is_household_member(household_id));

-- ─── list_items ───────────────────────────────────────────────────────────────

-- Items are gated through their parent list's household membership
create policy "list_items_select"
  on public.list_items
  for select
  using (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = list_id
        and public.is_household_member(gl.household_id)
    )
  );

create policy "list_items_insert"
  on public.list_items
  for insert
  with check (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = list_id
        and public.is_household_member(gl.household_id)
    )
  );

create policy "list_items_update"
  on public.list_items
  for update
  using (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = list_id
        and public.is_household_member(gl.household_id)
    )
  );

create policy "list_items_delete"
  on public.list_items
  for delete
  using (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = list_id
        and public.is_household_member(gl.household_id)
    )
  );

-- ─── favorites ────────────────────────────────────────────────────────────────

create policy "favorites_all"
  on public.favorites
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ─── recurring_item_stats ─────────────────────────────────────────────────────

create policy "recurring_stats_all"
  on public.recurring_item_stats
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ─── shopping_sessions ────────────────────────────────────────────────────────

create policy "shopping_sessions_all"
  on public.shopping_sessions
  for all
  using (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = list_id
        and public.is_household_member(gl.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = list_id
        and public.is_household_member(gl.household_id)
    )
  );

-- ─── shopping_session_events ──────────────────────────────────────────────────

create policy "session_events_all"
  on public.shopping_session_events
  for all
  using (
    exists (
      select 1 from public.shopping_sessions ss
      join public.grocery_lists gl on gl.id = ss.list_id
      where ss.id = session_id
        and public.is_household_member(gl.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.shopping_sessions ss
      join public.grocery_lists gl on gl.id = ss.list_id
      where ss.id = session_id
        and public.is_household_member(gl.household_id)
    )
  );

-- ─── user_preferences ─────────────────────────────────────────────────────────

-- Strictly personal — only the user themselves can access their own row
create policy "user_preferences_select_own"
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

create policy "user_preferences_insert_own"
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "user_preferences_update_own"
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Realtime Publication ─────────────────────────────────────────────────────
-- These tables need to be added to the Supabase "supabase_realtime" publication
-- so that Realtime subscriptions work. Run these after enabling Realtime in the
-- Supabase Dashboard → Table Editor → Replication tab for each table.
--
-- Alternatively run manually:
--   alter publication supabase_realtime add table public.grocery_lists;
--   alter publication supabase_realtime add table public.list_items;
--
-- Do NOT add shopping_session_events — too chatty for realtime broadcast.
