import { db } from '../db';
import { supabase } from '../lib/supabaseClient';
import { mapLocalListToRemote, mapLocalListItemToRemote } from '../repositories/remote/remoteListRepository';

export class LocalDataMigrator {
  /**
   * Returns summary counts of local data available to migrate.
   */
  async getLocalSummary(): Promise<{ listsCount: number; itemsCount: number; customItemsCount: number }> {
    const listsCount = await db.groceryLists.count();
    const itemsCount = await db.listItems.count();
    const customItemsCount = await db.catalogItems.filter((i) => i.isCustom).count();

    return { listsCount, itemsCount, customItemsCount };
  }

  /**
   * Uploads all local Dexie lists, items, and custom catalog items to the specified Supabase household.
   */
  async migrateToHousehold(householdId: string): Promise<{ migratedLists: number; migratedItems: number }> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const lists = await db.groceryLists.toArray();
    const items = await db.listItems.toArray();
    const customCatalogItems = await db.catalogItems.filter((i) => i.isCustom).toArray();
    const favorites = await db.favorites.toArray();

    // 1. Upload custom catalog items
    if (customCatalogItems.length > 0) {
      const remoteCustomItems = customCatalogItems.map((c) => ({
        id: c.id,
        category_id: c.categoryId,
        household_id: householdId,
        name: c.name,
        default_unit: c.defaultUnit,
        is_custom: true,
        created_at: c.createdAt,
      }));
      await supabase.from('catalog_items').upsert(remoteCustomItems);
    }

    // 2. Upload grocery lists (ensure at most 1 draft per household)
    if (lists.length > 0) {
      let draftFound = false;
      const remoteLists = lists.map((l) => {
        let status = l.status;
        if (status === 'draft') {
          if (draftFound) status = 'finalized';
          else draftFound = true;
        }
        return mapLocalListToRemote({ ...l, status }, householdId);
      });
      await supabase.from('grocery_lists').upsert(remoteLists);
    }

    // 3. Upload list items
    if (items.length > 0) {
      const remoteItems = items.map(mapLocalListItemToRemote);
      await supabase.from('list_items').upsert(remoteItems);
    }

    // 4. Upload favorites
    if (favorites.length > 0) {
      const remoteFavorites = favorites.map((f) => ({
        id: `${householdId}_${f.catalogItemId}`,
        household_id: householdId,
        catalog_item_id: f.catalogItemId,
      }));
      await supabase.from('favorites').upsert(remoteFavorites);
    }

    return {
      migratedLists: lists.length,
      migratedItems: items.length,
    };
  }
}

export const localDataMigrator = new LocalDataMigrator();
