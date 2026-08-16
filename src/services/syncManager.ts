import { db } from '../db';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/useAuthStore';
import type { PendingSyncOp } from '../types/database';
import { remoteListRepository } from '../repositories/remote/remoteListRepository';
import { remoteCatalogRepository } from '../repositories/remote/remoteCatalogRepository';

class SyncManager {
  private isFlushing = false;
  private syncListeners: Array<() => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flushPendingOps();
      });
    }
  }

  /**
   * Enqueues an operation to be synced to Supabase and immediately tries to flush if online.
   */
  async enqueueOp(
    tableName: PendingSyncOp['tableName'],
    operation: PendingSyncOp['operation'],
    recordId: string,
    payload: any
  ): Promise<void> {
    const authState = useAuthStore.getState();
    const household = authState.household;
    const user = authState.user;
    if (!household || !user) return; // Local-only mode, no sync queue needed

    const op: PendingSyncOp = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tableName,
      operation,
      recordId,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      householdId: household.id,
      userId: user.id,
    };

    await db.pendingSyncOps.add(op);

    // Attempt immediate background flush if online
    if (navigator.onLine && isSupabaseConfigured) {
      this.flushPendingOps().catch((err) => console.warn('Background sync flush error:', err));
    }
  }

  /**
   * Flushes pending operations from Dexie to Supabase in FIFO order.
   * Strictly enforces that queued operations match the currently authenticated user & household.
   */
  async flushPendingOps(): Promise<void> {
    if (this.isFlushing || !navigator.onLine || !isSupabaseConfigured || !supabase) return;
    const authState = useAuthStore.getState();
    const household = authState.household;
    const user = authState.user;
    if (!household || !user) return;

    this.isFlushing = true;
    try {
      const ops = await db.pendingSyncOps.orderBy('createdAt').toArray();
      if (ops.length === 0) return;

      for (const op of ops) {
        // Security check: Ignore / quarantine operations belonging to another user or household
        if (op.userId && op.userId !== user.id) {
          console.warn(`[SyncManager Security] Quarantining op ${op.id}: user mismatch (${op.userId} !== ${user.id})`);
          continue;
        }
        if (op.householdId && op.householdId !== household.id) {
          console.warn(`[SyncManager Security] Quarantining op ${op.id}: household mismatch (${op.householdId} !== ${household.id})`);
          continue;
        }

        try {
          await this.executeOp(op, household.id);
          // Operation succeeded, remove from queue
          await db.pendingSyncOps.delete(op.id);
        } catch (opErr) {
          console.warn(`Sync op ${op.id} failed, will retry:`, opErr);
          await db.pendingSyncOps.update(op.id, {
            retryCount: (op.retryCount || 0) + 1,
          });
          // If network error, stop flushing until next online event
          if (!navigator.onLine) break;
        }
      }

      this.notifySyncCompleted();
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Dispatches a single queued operation to Supabase.
   */
  private async executeOp(op: PendingSyncOp, householdId: string): Promise<void> {
    switch (op.tableName) {
      case 'grocery_lists':
        if (op.operation === 'delete') {
          await remoteListRepository.deleteList(op.recordId);
        } else if (op.operation === 'update' && op.payload?.status) {
          await remoteListRepository.updateListStatus(op.recordId, op.payload.status);
        }
        break;

      case 'list_items':
        if (op.operation === 'delete') {
          await remoteListRepository.removeListItem(op.recordId);
        } else if (op.operation === 'update') {
          await remoteListRepository.updateListItem(op.recordId, op.payload);
        }
        break;

      case 'favorites':
        if (op.operation === 'insert' || op.operation === 'delete') {
          // Favorite toggles can be synced
          await remoteCatalogRepository.toggleFavorite(householdId, op.recordId);
        }
        break;

      case 'catalog_items':
        if (op.operation === 'delete') {
          await remoteCatalogRepository.deleteCatalogItem(op.recordId);
        } else if (op.operation === 'update') {
          await remoteCatalogRepository.updateCatalogItem(op.recordId, op.payload);
        }
        break;

      default:
        break;
    }
  }

  /**
   * Pulls all household data from Supabase into local Dexie (hydrates cache).
   */
  async pullHouseholdData(householdId: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;

    try {
      // 1. Fetch remote lists
      const { data: remoteLists } = await supabase
        .from('grocery_lists')
        .select('*')
        .eq('household_id', householdId);

      if (remoteLists && remoteLists.length > 0) {
        const localLists = remoteLists.map((r: any) => ({
          id: r.id,
          title: r.title,
          listMonth: r.list_month,
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));

        await db.groceryLists.bulkPut(localLists);

        // 2. Fetch list items for these lists
        const listIds = remoteLists.map((l: any) => l.id);
        const { data: remoteItems } = await supabase
          .from('list_items')
          .select('*')
          .in('list_id', listIds);

        if (remoteItems) {
          const localItems = remoteItems.map((r: any) => ({
            id: r.id,
            listId: r.list_id,
            catalogItemId: r.catalog_item_id,
            itemNameSnapshot: r.item_name_snapshot,
            quantity: Number(r.quantity),
            unit: r.unit,
            estimatedPrice: r.estimated_price !== null ? Number(r.estimated_price) : null,
            actualPrice: r.actual_price !== null ? Number(r.actual_price) : null,
            isPurchased: Boolean(r.is_purchased),
            note: r.note,
            sortOrder: r.sort_order,
          }));

          await db.listItems.bulkPut(localItems);
        }
      }

      // 3. Fetch custom catalog items for household
      const { data: customItems } = await supabase
        .from('catalog_items')
        .select('*')
        .eq('household_id', householdId);

      if (customItems && customItems.length > 0) {
        const localCustom = customItems.map((r: any) => ({
          id: r.id,
          categoryId: r.category_id,
          name: r.name,
          defaultUnit: r.default_unit,
          isCustom: true,
          createdAt: r.created_at,
        }));

        await db.catalogItems.bulkPut(localCustom);
      }

      // 4. Fetch favorites for household
      const { data: favs } = await supabase
        .from('favorites')
        .select('*')
        .eq('household_id', householdId);

      if (favs && favs.length > 0) {
        await db.favorites.bulkPut(favs.map((f: any) => ({
          id: f.id,
          catalogItemId: f.catalog_item_id,
        })));
      }

      this.notifySyncCompleted();
    } catch (err) {
      console.error('Failed to pull household data from Supabase:', err);
    }
  }

  onSyncCompleted(listener: () => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  private notifySyncCompleted() {
    this.syncListeners.forEach((l) => l());
  }
}

export const syncManager = new SyncManager();
