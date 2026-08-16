import { supabase } from '../../lib/supabaseClient';
import type { GroceryList, ListItem, ListStatus } from '../../types/database';
import type { GroceryListWithItems } from '../listRepository';

export function mapRemoteList(row: any): GroceryList {
  return {
    id: row.id,
    title: row.title,
    listMonth: row.list_month,
    status: row.status as ListStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRemoteListItem(row: any): ListItem {
  return {
    id: row.id,
    listId: row.list_id,
    catalogItemId: row.catalog_item_id,
    itemNameSnapshot: row.item_name_snapshot,
    quantity: Number(row.quantity),
    unit: row.unit,
    estimatedPrice: row.estimated_price !== null ? Number(row.estimated_price) : null,
    actualPrice: row.actual_price !== null ? Number(row.actual_price) : null,
    isPurchased: Boolean(row.is_purchased),
    note: row.note,
    sortOrder: row.sort_order,
  };
}

export function mapLocalListToRemote(list: GroceryList, householdId: string): any {
  return {
    id: list.id,
    household_id: householdId,
    title: list.title,
    list_month: list.listMonth,
    status: list.status,
    created_at: list.createdAt,
    updated_at: list.updatedAt,
  };
}

export function mapLocalListItemToRemote(item: ListItem): any {
  return {
    id: item.id,
    list_id: item.listId,
    catalog_item_id: item.catalogItemId || null,
    item_name_snapshot: item.itemNameSnapshot,
    quantity: item.quantity,
    unit: item.unit,
    estimated_price: item.estimatedPrice,
    actual_price: item.actualPrice,
    is_purchased: item.isPurchased,
    note: item.note,
    sort_order: item.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

export class RemoteListRepository {
  async getCurrentDraft(householdId: string): Promise<GroceryListWithItems | null> {
    if (!supabase) return null;

    const { data: listData, error: listError } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('household_id', householdId)
      .eq('status', 'draft')
      .maybeSingle();

    if (listError || !listData) return null;

    const { data: itemsData, error: itemsError } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listData.id)
      .order('sort_order', { ascending: true });

    if (itemsError) {
      console.error('Failed to fetch remote draft items:', itemsError);
      return { list: mapRemoteList(listData), items: [] };
    }

    return {
      list: mapRemoteList(listData),
      items: (itemsData || []).map(mapRemoteListItem),
    };
  }

  async createDraftList(
    householdId: string,
    title?: string,
    month?: string,
    forceNew = false
  ): Promise<GroceryListWithItems> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const now = new Date();
    const currentMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const defaultTitle = title || `Grocery List (${now.toLocaleString('default', { month: 'long', year: 'numeric' })})`;

    if (forceNew) {
      // Finalize existing draft on remote
      await supabase
        .from('grocery_lists')
        .update({ status: 'finalized', updated_at: now.toISOString() })
        .eq('household_id', householdId)
        .eq('status', 'draft');
    } else {
      // Return existing draft if present
      const existing = await this.getCurrentDraft(householdId);
      if (existing) return existing;
    }

    const newList: GroceryList = {
      id: `list-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: defaultTitle,
      listMonth: currentMonth,
      status: 'draft',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const { error } = await supabase
      .from('grocery_lists')
      .insert(mapLocalListToRemote(newList, householdId));

    if (error) {
      // If unique constraint error (another client created draft simultaneously), fetch that draft
      if (error.code === '23505') {
        const active = await this.getCurrentDraft(householdId);
        if (active) return active;
      }
      throw new Error(error.message);
    }

    return { list: newList, items: [] };
  }

  async saveDraftList(householdId: string, list: GroceryList, items: ListItem[]): Promise<void> {
    if (!supabase) return;

    const now = new Date().toISOString();
    const updatedList = { ...list, updatedAt: now };

    // 1. Upsert list
    const { error: listError } = await supabase
      .from('grocery_lists')
      .upsert(mapLocalListToRemote(updatedList, householdId));

    if (listError) console.error('Remote save list error:', listError);

    // 2. Fetch existing remote items for this list to find deletions
    const { data: existingRemote } = await supabase
      .from('list_items')
      .select('id')
      .eq('list_id', list.id);

    const existingIds = (existingRemote || []).map((r) => r.id);
    const newIds = new Set(items.map((i) => i.id));
    const idsToDelete = existingIds.filter((id) => !newIds.has(id));

    if (idsToDelete.length > 0) {
      await supabase.from('list_items').delete().in('id', idsToDelete);
    }

    if (items.length > 0) {
      const remoteItems = items.map(mapLocalListItemToRemote);
      const { error: itemsError } = await supabase.from('list_items').upsert(remoteItems);
      if (itemsError) console.error('Remote save list items error:', itemsError);
    }
  }

  async updateListItem(itemId: string, updates: Partial<ListItem>): Promise<void> {
    if (!supabase) return;

    const remoteUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.quantity !== undefined) remoteUpdates.quantity = updates.quantity;
    if (updates.unit !== undefined) remoteUpdates.unit = updates.unit;
    if (updates.estimatedPrice !== undefined) remoteUpdates.estimated_price = updates.estimatedPrice;
    if (updates.actualPrice !== undefined) remoteUpdates.actual_price = updates.actualPrice;
    if (updates.isPurchased !== undefined) remoteUpdates.is_purchased = updates.isPurchased;
    if (updates.note !== undefined) remoteUpdates.note = updates.note;
    if (updates.itemNameSnapshot !== undefined) remoteUpdates.item_name_snapshot = updates.itemNameSnapshot;

    await supabase.from('list_items').update(remoteUpdates).eq('id', itemId);
  }

  async removeListItem(itemId: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('list_items').delete().eq('id', itemId);
  }

  async updateListStatus(listId: string, status: ListStatus): Promise<void> {
    if (!supabase) return;
    await supabase
      .from('grocery_lists')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', listId);
  }

  async getListWithItems(listId: string): Promise<GroceryListWithItems | null> {
    if (!supabase) return null;

    const { data: listData, error: listError } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('id', listId)
      .maybeSingle();

    if (listError || !listData) return null;

    const { data: itemsData } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .order('sort_order', { ascending: true });

    return {
      list: mapRemoteList(listData),
      items: (itemsData || []).map(mapRemoteListItem),
    };
  }

  async deleteList(listId: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('grocery_lists').delete().eq('id', listId);
  }
}

export const remoteListRepository = new RemoteListRepository();
