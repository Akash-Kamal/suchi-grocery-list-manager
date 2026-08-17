-- ============================================================
-- Suchi Grocery App — Enable Supabase Realtime
-- Migration 005: Add required tables to the supabase_realtime publication
--
-- WITHOUT this, Supabase Realtime postgres_changes subscriptions
-- silently receive zero events (subscribe() succeeds but no payloads arrive).
--
-- This migration is idempotent: it checks before altering.
-- ============================================================

DO $$
BEGIN
  -- Enable Realtime for grocery_lists (live list sync across household members)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'grocery_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.grocery_lists;
  END IF;

  -- Enable Realtime for list_items (live item-level edits, purchases, deletions)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'list_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.list_items;
  END IF;
END $$;
