import { db as defaultDb, SuchiDatabase } from '../db';
import type { GroceryList, ListItem, RecurringItemStat } from '../types/database';
import type { GroceryListWithItems } from './listRepository';
import { useAuthStore } from '../stores/useAuthStore';
import { remoteHistoryRepository } from './remote/remoteHistoryRepository';

export class HistoryRepository {
  private db: SuchiDatabase;

  constructor(db: SuchiDatabase = defaultDb) {
    this.db = db;
  }

  async getPastLists(limit = 20, offset = 0): Promise<GroceryList[]> {
    const lists = await this.db.groceryLists
      .where('status')
      .anyOf(['finalized', 'shopping', 'completed'])
      .reverse()
      .sortBy('createdAt');

    return lists.slice(offset, offset + limit);
  }

  async getListsByMonth(listMonth: string): Promise<GroceryListWithItems[]> {
    const lists = await this.db.groceryLists
      .where('listMonth')
      .equals(listMonth)
      .toArray();

    const results: GroceryListWithItems[] = [];
    for (const list of lists) {
      const items = await this.db.listItems
        .where('listId')
        .equals(list.id)
        .sortBy('sortOrder');
      results.push({ list, items });
    }

    return results;
  }

  async getItemHistory(catalogItemId: string): Promise<ListItem[]> {
    // Get all completed/finalized lists
    const pastLists = await this.db.groceryLists
      .where('status')
      .anyOf(['finalized', 'completed'])
      .toArray();

    const pastListIds = new Set(pastLists.map((l) => l.id));

    // Get list items matching catalogItemId from past lists
    const items = await this.db.listItems
      .where('catalogItemId')
      .equals(catalogItemId)
      .toArray();

    return items.filter((item) => pastListIds.has(item.listId));
  }

  /**
   * Returns all item histories for computing recurring stats.
   * IMPORTANT: Items from abandoned shopping sessions (sessions with null completedAt)
   * are excluded to prevent polluting frequency scores.
   * Falls back gracefully to including all finalized/completed lists that have NO session
   * record at all — for backward compatibility with data created before sessions were tracked.
   */
  async getAllItemHistories(): Promise<Map<string, { item: ListItem; listMonth: string; createdAt: string }[]>> {
    const pastLists = await this.db.groceryLists
      .where('status')
      .anyOf(['finalized', 'completed'])
      .toArray();

    // Get set of listIds that have at least one completed session
    const completedSessionListIds = new Set(
      (await this.db.shoppingSessions.filter((s) => s.completedAt !== null).toArray())
        .map((s) => s.listId)
    );

    // Get set of all listIds that have ANY session record
    const anySessionListIds = new Set(
      (await this.db.shoppingSessions.toArray()).map((s) => s.listId)
    );

    const listMap = new Map(pastLists.map((l) => [l.id, l]));

    const allItems = await this.db.listItems.toArray();
    const historyMap = new Map<string, { item: ListItem; listMonth: string; createdAt: string }[]>();

    for (const item of allItems) {
      if (!item.catalogItemId) continue;
      const list = listMap.get(item.listId);
      if (!list) continue;

      // Exclude items from lists that have sessions — but only completed ones count.
      // If a list has NO session record at all (pre-session-tracking data), include it
      // for backward compatibility.
      const hasAnySession = anySessionListIds.has(item.listId);
      if (hasAnySession && !completedSessionListIds.has(item.listId)) {
        // This list has session records, but none are completed (abandoned session) — skip.
        continue;
      }

      const record = { item, listMonth: list.listMonth, createdAt: list.createdAt };
      const existing = historyMap.get(item.catalogItemId) || [];
      existing.push(record);
      historyMap.set(item.catalogItemId, existing);
    }

    return historyMap;
  }

  async updateRecurringStats(stats: RecurringItemStat[]): Promise<void> {
    await this.db.transaction('rw', this.db.recurringItemStats, async () => {
      await this.db.recurringItemStats.bulkPut(stats);
    });

    const household = useAuthStore.getState().household;
    if (household) {
      remoteHistoryRepository.updateRecurringStats(household.id, stats).catch((err) => {
        console.warn('Sync recurring stats error:', err);
      });
    }
  }

  async getAllRecurringStats(): Promise<RecurringItemStat[]> {
    return this.db.recurringItemStats.toArray();
  }

  async getRecurringStatByCatalogItemId(catalogItemId: string): Promise<RecurringItemStat | undefined> {
    return this.db.recurringItemStats
      .where('catalogItemId')
      .equals(catalogItemId)
      .first();
  }
}

export const historyRepository = new HistoryRepository();
