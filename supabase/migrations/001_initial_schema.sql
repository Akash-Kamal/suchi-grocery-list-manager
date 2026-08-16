-- ============================================================
-- Suchi Grocery App — Supabase Schema
-- Migration 001: Initial Schema
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- After running, proceed to 002_rls_policies.sql
-- ============================================================

-- Enable UUID generation (already enabled on Supabase by default, but safe to re-declare)
create extension if not exists "pgcrypto";

-- ─── Enum Types ───────────────────────────────────────────────────────────────

create type public.member_role as enum ('owner', 'member');
create type public.list_status as enum ('draft', 'finalized', 'shopping', 'completed');
create type public.shopping_event_type as enum ('marked_bought', 'unmarked', 'quantity_changed');
create type public.measurement_system as enum ('metric', 'imperial', 'household');

-- ─── Households ───────────────────────────────────────────────────────────────

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.households is
  'One household = one shared grocery workspace. A user can belong to exactly one household (future: multi-household support can relax this).';

-- ─── Household Members ────────────────────────────────────────────────────────

create table public.household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.member_role not null default 'member',
  joined_at    timestamptz not null default now(),
  unique (household_id, user_id)
);

create index idx_household_members_user_id on public.household_members (user_id);
create index idx_household_members_household_id on public.household_members (household_id);

comment on table public.household_members is
  'Maps users to households. Owner role grants: rename household, remove members, generate invites.';

-- ─── Household Invites ────────────────────────────────────────────────────────

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- 8 random bytes → base64url string, ~11 chars, collision-resistant for this scale
  invite_code  text not null unique default replace(replace(encode(gen_random_bytes(8), 'base64'), '+', '-'), '/', '_'),
  created_by   uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  used_by      uuid references auth.users(id) on delete set null  -- null = not yet redeemed
);

create index idx_household_invites_code on public.household_invites (invite_code);
create index idx_household_invites_household_id on public.household_invites (household_id);

comment on table public.household_invites is
  'Short-lived, single-use invite codes. Owner shares the link; joining user redeems via Edge Function.';

-- ─── Categories ───────────────────────────────────────────────────────────────
-- Global read-only reference data. Same IDs as local Dexie seed data (e.g. "cat-kitchen").
-- Seeded once by migration 001_seed_categories.sql (or inline below).
-- No household scoping — categories are universal.

create table public.categories (
  id         text primary key,    -- matches Dexie seed IDs ('cat-kitchen', 'cat-dairy', …)
  name       text not null,
  sort_order integer not null default 0,
  icon       text not null default '🛒'
);

comment on table public.categories is
  'Global grocery categories (read-only reference data). Seeded by migration, never written by clients.';

-- Seed the 8 categories matching local Dexie seedData.ts
insert into public.categories (id, name, sort_order, icon) values
  ('cat-kitchen',   'Kitchen & Staples',     1,  '🌾'),
  ('cat-dairy',     'Dairy & Eggs',          2,  '🥛'),
  ('cat-produce',   'Fresh Produce',         3,  '🥦'),
  ('cat-meat',      'Meat & Seafood',        4,  '🍗'),
  ('cat-beverages', 'Beverages',             5,  '🧃'),
  ('cat-snacks',    'Snacks & Bakery',       6,  '🍪'),
  ('cat-household', 'Household & Cleaning',  7,  '🧹'),
  ('cat-personal',  'Personal Care',         8,  '🧴');

-- ─── Catalog Items ────────────────────────────────────────────────────────────
-- Global items (household_id IS NULL) = default seed catalog, readable by everyone.
-- Household items (household_id IS NOT NULL) = custom items, readable only by that household.

create table public.catalog_items (
  id           text primary key,    -- matches Dexie IDs ('item-atta', 'item-rice-basmati', …)
  category_id  text not null references public.categories(id),
  household_id uuid references public.households(id) on delete cascade,  -- null = global
  name         text not null,
  default_unit text not null,
  is_custom    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index idx_catalog_items_category_id on public.catalog_items (category_id);
create index idx_catalog_items_household_id on public.catalog_items (household_id);
create index idx_catalog_items_name on public.catalog_items using gin (to_tsvector('english', name));

comment on table public.catalog_items is
  'Global catalog items (household_id IS NULL) are seed data. Household items are custom additions.';

-- ─── Item Aliases ─────────────────────────────────────────────────────────────

create table public.item_aliases (
  id              text primary key,
  catalog_item_id text not null references public.catalog_items(id) on delete cascade,
  alias_text      text not null,
  locale          text not null default 'hi'
);

create index idx_item_aliases_catalog_item_id on public.item_aliases (catalog_item_id);

comment on table public.item_aliases is
  'Alternate search terms for catalog items, e.g. "Pyaz" → Onions. Locale-tagged.';

-- ─── Grocery Lists ────────────────────────────────────────────────────────────

create table public.grocery_lists (
  id           text primary key,    -- client-generated e.g. 'list-1720000000000-abc12' for merge compat
  household_id uuid not null references public.households(id) on delete cascade,
  title        text not null,
  list_month   text not null,        -- 'YYYY-MM' e.g. '2026-08'
  status       public.list_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_grocery_lists_household_status on public.grocery_lists (household_id, status);
create index idx_grocery_lists_updated_at on public.grocery_lists (updated_at desc);

-- DB-level enforcement of "at most one draft per household" (belt-and-braces on top of
-- the app-level forceNew invariant in listRepository.ts).
create unique index grocery_lists_one_draft_per_household
  on public.grocery_lists (household_id)
  where (status = 'draft');

comment on table public.grocery_lists is
  'Shared grocery lists. Partial unique index enforces at most one draft per household.';

-- ─── List Items ───────────────────────────────────────────────────────────────

create table public.list_items (
  id                 text primary key,   -- client-generated
  list_id            text not null references public.grocery_lists(id) on delete cascade,
  catalog_item_id    text references public.catalog_items(id) on delete set null,
  -- Snapshot-first: name captured at write time, never changes even if catalog item is renamed
  item_name_snapshot text not null,
  quantity           numeric not null default 1 check (quantity > 0),
  unit               text not null,
  estimated_price    numeric check (estimated_price >= 0),
  actual_price       numeric check (actual_price >= 0),
  is_purchased       boolean not null default false,
  note               text,
  sort_order         integer not null default 0,
  -- updated_at for last-write-wins conflict resolution in sync layer
  updated_at         timestamptz not null default now()
);

create index idx_list_items_list_id on public.list_items (list_id);
create index idx_list_items_catalog_item_id on public.list_items (catalog_item_id);

comment on table public.list_items is
  'Snapshot-first items. item_name_snapshot is captured at write time and never mutated.';

-- ─── Favorites ────────────────────────────────────────────────────────────────

create table public.favorites (
  id              text primary key,   -- client-generated
  household_id    uuid not null references public.households(id) on delete cascade,
  catalog_item_id text not null references public.catalog_items(id) on delete cascade,
  unique (household_id, catalog_item_id)
);

create index idx_favorites_household_id on public.favorites (household_id);

-- ─── Recurring Item Stats ─────────────────────────────────────────────────────

create table public.recurring_item_stats (
  id                    text primary key,    -- 'stat-{catalog_item_id}'
  household_id          uuid not null references public.households(id) on delete cascade,
  catalog_item_id       text not null references public.catalog_items(id) on delete cascade,
  frequency_score       numeric not null default 0 check (frequency_score between 0 and 1),
  median_quantity       numeric not null default 1 check (median_quantity > 0),
  median_unit           text not null default 'kg',
  last_purchased_at     timestamptz,
  typical_interval_days integer,
  unique (household_id, catalog_item_id)
);

create index idx_recurring_stats_household_id on public.recurring_item_stats (household_id);

-- ─── Shopping Sessions ────────────────────────────────────────────────────────

create table public.shopping_sessions (
  id           text primary key,   -- client-generated
  list_id      text not null references public.grocery_lists(id) on delete cascade,
  started_at   timestamptz not null default now(),
  completed_at timestamptz          -- null = session still open / was abandoned
);

create index idx_shopping_sessions_list_id on public.shopping_sessions (list_id);

-- ─── Shopping Session Events ──────────────────────────────────────────────────

create table public.shopping_session_events (
  id           text primary key,   -- client-generated
  session_id   text not null references public.shopping_sessions(id) on delete cascade,
  list_item_id text not null,       -- intentionally not FK'd; item may be deleted post-session
  event_type   public.shopping_event_type not null,
  timestamp    timestamptz not null default now()
);

create index idx_session_events_session_id on public.shopping_session_events (session_id);

-- ─── User Preferences ─────────────────────────────────────────────────────────
-- Per-user (not per-household). Theme preference is personal, not shared.

create table public.user_preferences (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  language              text not null default 'en',
  theme                 text not null default 'system',   -- 'light' | 'dark' | 'system'
  measurement_system    public.measurement_system not null default 'metric',
  budget_ceiling        numeric check (budget_ceiling >= 0),
  reminder_day_of_month smallint check (reminder_day_of_month between 1 and 31)
);

comment on table public.user_preferences is
  'Per-user settings (theme, language). Not shared with household members.';
