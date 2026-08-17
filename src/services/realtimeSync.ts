import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { db } from '../db';
import { useDraftListStore } from '../stores/useDraftListStore';
import { useAuthStore } from '../stores/useAuthStore';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { mapRemoteList, mapRemoteListItem } from '../repositories/remote/remoteListRepository';

class RealtimeSyncService {
  private channel: RealtimeChannel | null = null;
  private currentHouseholdId: string | null = null;

  /**
   * Subscribes to Supabase Realtime changes for the given household's lists and items.
   */
  subscribeHousehold(householdId: string): void {
    if (!isSupabaseConfigured || !supabase || this.currentHouseholdId === householdId) return;

    this.unsubscribe();
    this.currentHouseholdId = householdId;

    this.channel = supabase
      .channel(`household:${householdId}`)
      // 1. Listen for grocery_lists changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'grocery_lists',
          filter: `household_id=eq.${householdId}`,
        },
        async (payload) => {
          await this.handleListChange(payload);
        }
      )
      // 2. Listen for list_items changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'list_items',
        },
        async (payload) => {
          await this.handleItemChange(payload);
        }
      )
      // 3. Listen for household_members changes (member joins, leaves, role updates)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'household_members',
          filter: `household_id=eq.${householdId}`,
        },
        async () => {
          await useAuthStore.getState().fetchHouseholdMembers();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Channel active
        }
      });
  }

  /**
   * Handles incoming Realtime changes on grocery_lists.
   */
  private async handleListChange(payload: any): Promise<void> {
    const eventType = payload.eventType;

    if (eventType === 'DELETE') {
      const oldId = payload.old?.id;
      if (oldId) {
        await db.groceryLists.delete(oldId);
        await useDraftListStore.getState().loadDraftList();
      }
      return;
    }

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const row = payload.new;
      if (!row) return;

      const remoteList = mapRemoteList(row);

      // Last-Write-Wins: compare updated_at
      const localList = await db.groceryLists.get(remoteList.id);
      if (localList && localList.updatedAt > remoteList.updatedAt) {
        // Local is newer, ignore older remote event
        return;
      }

      await db.groceryLists.put(remoteList);
      await useDraftListStore.getState().loadDraftList();
    }
  }

  /**
   * Handles incoming Realtime changes on list_items.
   */
  private async handleItemChange(payload: any): Promise<void> {
    const eventType = payload.eventType;

    if (eventType === 'DELETE') {
      const oldId = payload.old?.id;
      if (oldId) {
        await db.listItems.delete(oldId);
        await useDraftListStore.getState().loadDraftList();
      }
      return;
    }

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const row = payload.new;
      if (!row) return;

      // Verify this list belongs to a known list in local Dexie; if missing, fetch it
      let listExists = await db.groceryLists.get(row.list_id);
      if (!listExists && supabase) {
        const { data: remoteListRow } = await supabase
          .from('grocery_lists')
          .select('*')
          .eq('id', row.list_id)
          .maybeSingle();

        if (remoteListRow) {
          await db.groceryLists.put(mapRemoteList(remoteListRow));
          listExists = await db.groceryLists.get(row.list_id);
        }
      }

      if (!listExists) return;

      const remoteItem = mapRemoteListItem(row);
      await db.listItems.put(remoteItem);
      await useDraftListStore.getState().loadDraftList();
    }
  }

  /**
   * Unsubscribes from Realtime channel and cleans up listeners.
   */
  unsubscribe(): void {
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.currentHouseholdId = null;
    }
  }
}

export const realtimeSync = new RealtimeSyncService();
