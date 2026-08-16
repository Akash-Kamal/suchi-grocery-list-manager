import { supabase } from '../../lib/supabaseClient';
import type { CatalogItem, Category, Favorite } from '../../types/database';

export function mapRemoteCatalogItem(row: any): CatalogItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    defaultUnit: row.default_unit,
    isCustom: Boolean(row.is_custom),
    createdAt: row.created_at,
  };
}

export class RemoteCatalogRepository {
  async getCategories(): Promise<Category[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
      icon: r.icon,
    }));
  }

  async getCatalogItems(householdId?: string): Promise<CatalogItem[]> {
    if (!supabase) return [];

    let query = supabase.from('catalog_items').select('*');
    if (householdId) {
      query = query.or(`household_id.is.null,household_id.eq.${householdId}`);
    } else {
      query = query.is('household_id', null);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapRemoteCatalogItem);
  }

  async getItemsByCategory(categoryId: string, householdId?: string): Promise<CatalogItem[]> {
    if (categoryId === 'all') {
      return this.getCatalogItems(householdId);
    }

    if (!supabase) return [];
    let query = supabase.from('catalog_items').select('*').eq('category_id', categoryId);
    if (householdId) {
      query = query.or(`household_id.is.null,household_id.eq.${householdId}`);
    } else {
      query = query.is('household_id', null);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapRemoteCatalogItem);
  }

  async searchCatalog(query: string, categoryId: string = 'all', householdId?: string): Promise<CatalogItem[]> {
    const trimmed = query.trim().toLowerCase();
    const baseItems = await this.getItemsByCategory(categoryId, householdId);

    if (!trimmed) return baseItems;

    // Filter by name match
    const directMatches = baseItems.filter((i) => i.name.toLowerCase().includes(trimmed));

    // Look up aliases
    if (!supabase) return directMatches;
    const { data: matchingAliases } = await supabase
      .from('item_aliases')
      .select('catalog_item_id')
      .ilike('alias_text', `%${trimmed}%`);

    const aliasIds = new Set((matchingAliases || []).map((a) => a.catalog_item_id));
    const resultIds = new Set(directMatches.map((i) => i.id));

    for (const item of baseItems) {
      if (aliasIds.has(item.id)) {
        resultIds.add(item.id);
      }
    }

    return baseItems.filter((i) => resultIds.has(i.id));
  }

  async getFavorites(householdId: string): Promise<Favorite[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('household_id', householdId);

    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      catalogItemId: r.catalog_item_id,
    }));
  }

  async isFavorite(householdId: string, catalogItemId: string): Promise<boolean> {
    if (!supabase) return false;
    const { data } = await supabase
      .from('favorites')
      .select('id')
      .eq('household_id', householdId)
      .eq('catalog_item_id', catalogItemId)
      .maybeSingle();

    return Boolean(data);
  }

  async toggleFavorite(householdId: string, catalogItemId: string): Promise<boolean> {
    if (!supabase) return false;

    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('household_id', householdId)
      .eq('catalog_item_id', catalogItemId)
      .maybeSingle();

    if (existing) {
      await supabase.from('favorites').delete().eq('id', existing.id);
      return false;
    } else {
      const newFav = {
        id: `fav-${Date.now()}`,
        household_id: householdId,
        catalog_item_id: catalogItemId,
      };
      await supabase.from('favorites').insert(newFav);
      return true;
    }
  }

  async addCustomCatalogItem(
    householdId: string,
    item: Omit<CatalogItem, 'id' | 'isCustom' | 'createdAt'> & { createdAt?: string }
  ): Promise<CatalogItem> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const newItem: CatalogItem = {
      ...item,
      id: `custom-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isCustom: true,
      createdAt: item.createdAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('catalog_items').insert({
      id: newItem.id,
      category_id: newItem.categoryId,
      household_id: householdId,
      name: newItem.name,
      default_unit: newItem.defaultUnit,
      is_custom: true,
      created_at: newItem.createdAt,
    });

    if (error) throw new Error(error.message);
    return newItem;
  }

  async updateCatalogItem(id: string, updates: Partial<CatalogItem>): Promise<void> {
    if (!supabase) return;
    const remoteUpdates: any = {};
    if (updates.name !== undefined) remoteUpdates.name = updates.name;
    if (updates.categoryId !== undefined) remoteUpdates.category_id = updates.categoryId;
    if (updates.defaultUnit !== undefined) remoteUpdates.default_unit = updates.defaultUnit;

    await supabase.from('catalog_items').update(remoteUpdates).eq('id', id);
  }

  async deleteCatalogItem(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('catalog_items').delete().eq('id', id);
  }

  async getItemsWithFrequencyScores(householdId: string): Promise<(CatalogItem & { frequencyScore: number })[]> {
    if (!supabase) return [];

    const [items, { data: statsData }] = await Promise.all([
      this.getCatalogItems(householdId),
      supabase.from('recurring_item_stats').select('*').eq('household_id', householdId),
    ]);

    const scoreMap = new Map((statsData || []).map((s: any) => [s.catalog_item_id, Number(s.frequency_score)]));

    return items.map((item) => ({
      ...item,
      frequencyScore: scoreMap.get(item.id) ?? 0,
    }));
  }
}

export const remoteCatalogRepository = new RemoteCatalogRepository();
