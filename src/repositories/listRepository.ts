import { db as defaultDb, SuchiDatabase } from '../db';
import type { GroceryList, ListItem, ListStatus } from '../types/database';
import { useAuthStore } from '../stores/useAuthStore';
import { remoteListRepository } from './remote/remoteListRepository';
import { syncManager } from '../services/syncManager';

export interface GroceryListWithItems {
  list: GroceryList;
  items: ListItem[];
}

/**
 * Returns true if the given draft's listMonth is before the current calendar month.
 * Used to detect stale drafts that were started in a previous month.
 */
export function isDraftStale(draft: GroceryList): boolean {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return draft.listMonth < currentMonth;
}

export class ListRepository {
  private db: SuchiDatabase;

  constructor(db: SuchiDatabase = defaultDb) {
    this.db = db;
  }

  /**
   * Creates or retrieves a draft grocery list.
   * @param title   Optional custom title.
   * @param month   Optional month string (e.g. "2026-08"). Defaults to current month.
   * @param forceNew When true, any existing draft is finalized first (preserving history),
   *                 then a brand-new draft is created for the current month.
   *                 This enforces the single-active-draft invariant on smart-repeat and imports.
   */
  async createDraftList(title?: string, month?: string, forceNew = false): Promise<GroceryListWithItems> {
    const now = new Date();
    const currentMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const defaultTitle = title || `Grocery List (${now.toLocaleString('default', { month: 'long', year: 'numeric' })})`;

    if (forceNew) {
      // Finalize all existing draft rows so history is preserved and the
      // single-active-draft invariant is maintained.
      const existingDrafts = await this.db.groceryLists
        .where('status')
        .equals('draft')
        .toArray();
      for (const d of existingDrafts) {
        await this.db.groceryLists.update(d.id, {
          status: 'finalized',
          updatedAt: now.toISOString(),
        });
        // Sync finalization
        const household = useAuthStore.getState().household;
        if (household) {
          remoteListRepository.updateListStatus(d.id, 'finalized').catch(() => {});
        }
      }
    } else {
      // If in a household, first check if Supabase has an existing draft before creating a new one
      const household = useAuthStore.getState().household;
      if (household) {
        try {
          const remoteDraft = await remoteListRepository.getCurrentDraft(household.id);
          if (remoteDraft) {
            await this.db.groceryLists.put(remoteDraft.list);
            if (remoteDraft.items.length > 0) {
              await this.db.listItems.bulkPut(remoteDraft.items);
            }
            return remoteDraft;
          }
        } catch (rErr) {
          console.warn('Could not fetch remote draft:', rErr);
        }
      }

      // Default: return existing draft from Dexie if one is already active (latest updatedAt first)
      const existingDrafts = await this.db.groceryLists
        .where('status')
        .equals('draft')
        .reverse()
        .sortBy('updatedAt');

      if (existingDrafts && existingDrafts.length > 0) {
        const activeDraft = existingDrafts[0];
        // Clean up duplicate drafts if any
        if (existingDrafts.length > 1) {
          const extraIds = existingDrafts.slice(1).map((d) => d.id);
          await this.db.groceryLists.bulkDelete(extraIds);
          for (const eId of extraIds) {
            await this.db.listItems.where('listId').equals(eId).delete();
          }
        }
        const items = await this.db.listItems
          .where('listId')
          .equals(activeDraft.id)
          .sortBy('sortOrder');
        return { list: activeDraft, items };
      }
    }

    const newList: GroceryList = {
      id: `list-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: defaultTitle,
      listMonth: currentMonth,
      status: 'draft',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.db.groceryLists.add(newList);

    // Sync to Supabase if in a household
    const household = useAuthStore.getState().household;
    if (household) {
      remoteListRepository.saveDraftList(household.id, newList, []).catch((err) => {
        console.warn('Sync draft creation error, queuing:', err);
        syncManager.enqueueOp('grocery_lists', 'insert', newList.id, newList);
      });
    }

    return { list: newList, items: [] };
  }

  async getCurrentDraft(): Promise<GroceryListWithItems | null> {
    const household = useAuthStore.getState().household;

    // Pick latest updated draft first
    const drafts = await this.db.groceryLists
      .where('status')
      .equals('draft')
      .reverse()
      .sortBy('updatedAt');

    if (drafts.length > 0) {
      const draft = drafts[0];
      // Clean up duplicate drafts if any
      if (drafts.length > 1) {
        const extraIds = drafts.slice(1).map((d) => d.id);
        await this.db.groceryLists.bulkDelete(extraIds);
        for (const eId of extraIds) {
          await this.db.listItems.where('listId').equals(eId).delete();
        }
      }

      const items = await this.db.listItems
        .where('listId')
        .equals(draft.id)
        .sortBy('sortOrder');

      return { list: draft, items };
    }

    // If Dexie has no draft, but user is in a household, query remote Supabase directly!
    if (household) {
      try {
        const remoteDraft = await remoteListRepository.getCurrentDraft(household.id);
        if (remoteDraft) {
          await this.db.groceryLists.put(remoteDraft.list);
          if (remoteDraft.items.length > 0) {
            await this.db.listItems.bulkPut(remoteDraft.items);
          }
          return remoteDraft;
        }
      } catch (rErr) {
        console.warn('Could not fetch remote draft in getCurrentDraft:', rErr);
      }
    }

    return null;
  }

  async saveDraftList(list: GroceryList, items: ListItem[]): Promise<void> {
    const now = new Date().toISOString();
    const updatedList = { ...list, updatedAt: now };

    await this.db.transaction('rw', [this.db.groceryLists, this.db.listItems], async () => {
      await this.db.groceryLists.put(updatedList);

      // Remove items no longer present
      const existingItemIds = (await this.db.listItems.where('listId').equals(list.id).toArray()).map(i => i.id);
      const newItemIds = new Set(items.map(i => i.id));
      const idsToDelete = existingItemIds.filter(id => !newItemIds.has(id));

      if (idsToDelete.length > 0) {
        await this.db.listItems.bulkDelete(idsToDelete);
      }

      if (items.length > 0) {
        await this.db.listItems.bulkPut(items);
      }
    });

    // Background push to Supabase
    const household = useAuthStore.getState().household;
    if (household) {
      remoteListRepository.saveDraftList(household.id, updatedList, items).catch((err) => {
        console.warn('Background sync save draft error, queuing:', err);
        syncManager.enqueueOp('grocery_lists', 'upsert', updatedList.id, updatedList);
      });
    }
  }

  async addItemToList(
    listId: string,
    itemData: Omit<ListItem, 'id' | 'listId' | 'sortOrder'>
  ): Promise<ListItem> {
    const existingItemsCount = await this.db.listItems.where('listId').equals(listId).count();
    
    const newItem: ListItem = {
      ...itemData,
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      listId,
      sortOrder: existingItemsCount + 1,
    };

    await this.db.listItems.add(newItem);

    // Update list's updatedAt
    await this.db.groceryLists.update(listId, { updatedAt: new Date().toISOString() });

    // Sync to Supabase
    const household = useAuthStore.getState().household;
    if (household) {
      const currentList = await this.db.groceryLists.get(listId);
      const allItems = await this.db.listItems.where('listId').equals(listId).toArray();
      if (currentList) {
        remoteListRepository.saveDraftList(household.id, currentList, allItems).catch(() => {
          syncManager.enqueueOp('list_items', 'insert', newItem.id, newItem);
        });
      }
    }

    return newItem;
  }

  async updateListItem(itemId: string, updates: Partial<ListItem>): Promise<void> {
    const item = await this.db.listItems.get(itemId);
    if (!item) return;

    await this.db.listItems.update(itemId, updates);
    await this.db.groceryLists.update(item.listId, { updatedAt: new Date().toISOString() });

    // Sync to Supabase
    const household = useAuthStore.getState().household;
    if (household) {
      remoteListRepository.updateListItem(itemId, updates).catch((err) => {
        console.warn('Sync update item error, queuing:', err);
        syncManager.enqueueOp('list_items', 'update', itemId, updates);
      });
    }
  }

  async removeListItem(itemId: string): Promise<void> {
    const item = await this.db.listItems.get(itemId);
    if (!item) return;

    await this.db.listItems.delete(itemId);
    await this.db.groceryLists.update(item.listId, { updatedAt: new Date().toISOString() });

    // Sync to Supabase
    const household = useAuthStore.getState().household;
    if (household) {
      remoteListRepository.removeListItem(itemId).catch((err) => {
        console.warn('Sync delete item error, queuing:', err);
        syncManager.enqueueOp('list_items', 'delete', itemId, null);
      });
    }
  }

  async updateListStatus(listId: string, status: ListStatus): Promise<void> {
    await this.db.groceryLists.update(listId, {
      status,
      updatedAt: new Date().toISOString(),
    });

    // Sync to Supabase
    const household = useAuthStore.getState().household;
    if (household) {
      remoteListRepository.updateListStatus(listId, status).catch((err) => {
        console.warn('Sync update list status error, queuing:', err);
        syncManager.enqueueOp('grocery_lists', 'update', listId, { status });
      });
    }
  }

  async getListWithItems(listId: string): Promise<GroceryListWithItems | null> {
    const list = await this.db.groceryLists.get(listId);
    if (!list) return null;

    const items = await this.db.listItems
      .where('listId')
      .equals(listId)
      .sortBy('sortOrder');

    return { list, items };
  }

  async deleteList(listId: string): Promise<void> {
    await this.db.transaction('rw', [this.db.groceryLists, this.db.listItems, this.db.shoppingSessions], async () => {
      await this.db.listItems.where('listId').equals(listId).delete();
      await this.db.shoppingSessions.where('listId').equals(listId).delete();
      await this.db.groceryLists.delete(listId);
    });

    // Sync to Supabase
    const household = useAuthStore.getState().household;
    if (household) {
      remoteListRepository.deleteList(listId).catch((err) => {
        console.warn('Sync delete list error, queuing:', err);
        syncManager.enqueueOp('grocery_lists', 'delete', listId, null);
      });
    }
  }
}

export const listRepository = new ListRepository();
