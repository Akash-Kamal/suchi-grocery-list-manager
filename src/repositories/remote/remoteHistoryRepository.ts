import { supabase } from '../../lib/supabaseClient';
import type { GroceryList, ListItem, RecurringItemStat } from '../../types/database';
import type { GroceryListWithItems } from '../listRepository';
import { mapRemoteList, mapRemoteListItem } from './remoteListRepository';

export class RemoteHistoryRepository {
  async getPastLists(householdId: string, limit = 20, offset = 0): Promise<GroceryList[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('household_id', householdId)
      .in('status', ['finalized', 'shopping', 'completed'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) return [];
    return data.map(mapRemoteList);
  }

  async getListsByMonth(householdId: string, listMonth: string): Promise<GroceryListWithItems[]> {
    if (!supabase) return [];

    const { data: listsData, error: listsError } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('household_id', householdId)
      .eq('list_month', listMonth);

    if (listsError || !listsData) return [];

    const listIds = listsData.map((l) => l.id);
    const { data: itemsData } = await supabase
      .from('list_items')
      .select('*')
      .in('list_id', listIds)
      .order('sort_order', { ascending: true });

    const itemsMap = new Map<string, ListItem[]>();
    for (const itemRow of itemsData || []) {
      const item = mapRemoteListItem(itemRow);
      const list = itemsMap.get(item.listId) || [];
      list.push(item);
      itemsMap.set(item.listId, list);
    }

    return listsData.map((l) => ({
      list: mapRemoteList(l),
      items: itemsMap.get(l.id) || [],
    }));
  }

  async getAllItemHistories(
    householdId: string
  ): Promise<Map<string, { item: ListItem; listMonth: string; createdAt: string }[]>> {
    if (!supabase) return new Map();

    const { data: pastLists } = await supabase
      .from('grocery_lists')
      .select('id, list_month, created_at')
      .eq('household_id', householdId)
      .in('status', ['finalized', 'completed']);

    if (!pastLists || pastLists.length === 0) return new Map();

    const listMap = new Map(pastLists.map((l) => [l.id, l]));
    const listIds = pastLists.map((l) => l.id);

    const { data: allItems } = await supabase
      .from('list_items')
      .select('*')
      .in('list_id', listIds);

    const historyMap = new Map<string, { item: ListItem; listMonth: string; createdAt: string }[]>();

    for (const row of allItems || []) {
      if (!row.catalog_item_id) continue;
      const list = listMap.get(row.list_id);
      if (!list) continue;

      const item = mapRemoteListItem(row);
      const record = { item, listMonth: list.list_month, createdAt: list.created_at };
      const existing = historyMap.get(item.catalogItemId!) || [];
      existing.push(record);
      historyMap.set(item.catalogItemId!, existing);
    }

    return historyMap;
  }

  async updateRecurringStats(householdId: string, stats: RecurringItemStat[]): Promise<void> {
    if (!supabase || stats.length === 0) return;

    const rows = stats.map((s) => ({
      id: `${householdId}_${s.catalogItemId}`,
      household_id: householdId,
      catalog_item_id: s.catalogItemId,
      frequency_score: s.frequencyScore,
      median_quantity: s.medianQuantity,
      median_unit: s.medianUnit,
      last_purchased_at: s.lastPurchasedAt,
      typical_interval_days: s.typicalIntervalDays,
    }));

    await supabase.from('recurring_item_stats').upsert(rows);
  }

  async getAllRecurringStats(householdId: string): Promise<RecurringItemStat[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('recurring_item_stats')
      .select('*')
      .eq('household_id', householdId);

    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      catalogItemId: r.catalog_item_id,
      frequencyScore: Number(r.frequency_score),
      medianQuantity: Number(r.median_quantity),
      medianUnit: r.median_unit,
      lastPurchasedAt: r.last_purchased_at,
      typicalIntervalDays: r.typical_interval_days,
    }));
  }
}

export const remoteHistoryRepository = new RemoteHistoryRepository();
