-- ============================================================
-- Suchi Grocery App — Enable Snapshot-First Items & Remove Catalog FK Blocker
-- Migration 010: Drop strict FK constraints on catalog_item_id so all items sync
-- ============================================================

-- 1. Drop strict FK constraint on list_items so any snapshot item (starter catalog or custom) can sync freely
alter table if exists public.list_items drop constraint if exists list_items_catalog_item_id_fkey;

-- 2. Drop strict FK constraint on favorites so any catalog item can be favorited
alter table if exists public.favorites drop constraint if exists favorites_catalog_item_id_fkey;

-- 3. Drop strict FK constraint on item_aliases
alter table if exists public.item_aliases drop constraint if exists item_aliases_catalog_item_id_fkey;

-- 4. Ensure categories match all client categories
insert into public.categories (id, name, sort_order, icon) values
  ('cat-cleaning', 'Cleaning & Household', 3, '🧹'),
  ('cat-baby', 'Baby Care', 6, '👶'),
  ('cat-pet', 'Pet Care', 7, '🐕'),
  ('cat-misc', 'Miscellaneous', 8, '📦')
on conflict (id) do nothing;
