import { db as defaultDb, SuchiDatabase } from '../db';
import type { CatalogItem, Category, Favorite, ItemAlias } from '../types/database';
import { useAuthStore } from '../stores/useAuthStore';
import { remoteCatalogRepository } from './remote/remoteCatalogRepository';
import { syncManager } from '../services/syncManager';

export class CatalogRepository {
  private db: SuchiDatabase;

  constructor(db: SuchiDatabase = defaultDb) {
    this.db = db;
  }

  async getCategories(): Promise<Category[]> {
    return this.db.categories.orderBy('sortOrder').toArray();
  }

  async getCatalogItems(): Promise<CatalogItem[]> {
    return this.db.catalogItems.toArray();
  }

  async getCatalogItemById(id: string): Promise<CatalogItem | undefined> {
    return this.db.catalogItems.get(id);
  }

  async getItemsByCategory(categoryId: string): Promise<CatalogItem[]> {
    if (categoryId === 'all') {
      return this.getCatalogItems();
    }
    return this.db.catalogItems.where('categoryId').equals(categoryId).toArray();
  }

  async searchCatalog(query: string, categoryId: string = 'all'): Promise<CatalogItem[]> {
    const trimmed = query.trim().toLowerCase();
    let baseItems: CatalogItem[];

    if (categoryId === 'favorites') {
      const favs = await this.db.favorites.toArray();
      const favIds = new Set(favs.map((f) => f.catalogItemId));
      baseItems = await this.db.catalogItems.filter((item) => favIds.has(item.id)).toArray();
    } else if (categoryId !== 'all') {
      baseItems = await this.db.catalogItems.where('categoryId').equals(categoryId).toArray();
    } else {
      baseItems = await this.db.catalogItems.toArray();
    }

    if (!trimmed) {
      return baseItems;
    }

    // Direct name match
    const directMatches = baseItems.filter((item) => item.name.toLowerCase().includes(trimmed));

    // Alias search
    const matchingAliases = await this.db.itemAliases
      .filter((alias) => alias.aliasText.toLowerCase().includes(trimmed))
      .toArray();

    const aliasCatalogIds = new Set(matchingAliases.map((a) => a.catalogItemId));

    const resultIds = new Set(directMatches.map((m) => m.id));
    for (const item of baseItems) {
      if (aliasCatalogIds.has(item.id)) {
        resultIds.add(item.id);
      }
    }

    return baseItems.filter((item) => resultIds.has(item.id));
  }

  async getFavorites(): Promise<Favorite[]> {
    return this.db.favorites.toArray();
  }

  async isFavorite(catalogItemId: string): Promise<boolean> {
    const fav = await this.db.favorites.where('catalogItemId').equals(catalogItemId).first();
    return Boolean(fav);
  }

  async toggleFavorite(catalogItemId: string): Promise<boolean> {
    const existing = await this.db.favorites.where('catalogItemId').equals(catalogItemId).first();
    let isNowFav: boolean;

    if (existing) {
      await this.db.favorites.delete(existing.id);
      isNowFav = false;
    } else {
      const newFav: Favorite = {
        id: `fav-${Date.now()}`,
        catalogItemId,
      };
      await this.db.favorites.add(newFav);
      isNowFav = true;
    }

    // Sync to Supabase if in household
    const household = useAuthStore.getState().household;
    if (household) {
      remoteCatalogRepository.toggleFavorite(household.id, catalogItemId).catch((err) => {
        console.warn('Sync favorite error, queuing:', err);
        syncManager.enqueueOp('favorites', isNowFav ? 'insert' : 'delete', catalogItemId, null);
      });
    }

    return isNowFav;
  }

  async addCustomCatalogItem(item: Omit<CatalogItem, 'id' | 'isCustom' | 'createdAt'> & { createdAt?: string }): Promise<CatalogItem> {
    const newItem: CatalogItem = {
      ...item,
      id: `custom-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isCustom: true,
      createdAt: item.createdAt || new Date().toISOString(),
    };
    await this.db.catalogItems.add(newItem);

    // Sync to Supabase if in household
    const household = useAuthStore.getState().household;
    if (household) {
      remoteCatalogRepository.addCustomCatalogItem(household.id, newItem).catch((err) => {
        console.warn('Sync custom item error, queuing:', err);
        syncManager.enqueueOp('catalog_items', 'insert', newItem.id, newItem);
      });
    }

    return newItem;
  }

  async addOnlineCatalogItem(product: {
    barcode: string;
    productName: string;
    brand?: string | null;
    categoryId?: string | null;
    unit?: string | null;
    imageUrl?: string | null;
  }): Promise<CatalogItem> {
    const normalizedBarcode = (product.barcode || '').trim();

    // Check if item with this exact barcode already exists locally
    if (normalizedBarcode) {
      const existingByBarcode = await this.db.catalogItems
        .filter((item) => (item.barcode || '').trim() === normalizedBarcode)
        .first();

      if (existingByBarcode) {
        return existingByBarcode;
      }
    }

    // Check if item with the same name already exists
    const cleanName = product.productName.trim();
    const existingByName = await this.db.catalogItems
      .filter((item) => item.name.toLowerCase() === cleanName.toLowerCase())
      .first();

    if (existingByName) {
      if (normalizedBarcode && !existingByName.barcode) {
        await this.updateCatalogItem(existingByName.id, { barcode: normalizedBarcode });
      }
      return existingByName;
    }

    const newItem: CatalogItem = {
      id: `custom-item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      categoryId: product.categoryId || 'cat-kitchen',
      name: cleanName,
      defaultUnit: product.unit || 'pack',
      isCustom: true,
      barcode: normalizedBarcode || null,
      brand: product.brand || null,
      imageUrl: product.imageUrl || null,
      createdAt: new Date().toISOString(),
    };

    await this.db.catalogItems.add(newItem);

    // Sync to Supabase if in household
    const household = useAuthStore.getState().household;
    if (household) {
      remoteCatalogRepository.addCustomCatalogItem(household.id, newItem).catch((err) => {
        console.warn('Sync custom item error, queuing:', err);
        syncManager.enqueueOp('catalog_items', 'insert', newItem.id, newItem);
      });
    }

    return newItem;
  }

  async updateCatalogItem(id: string, updates: Partial<CatalogItem>): Promise<void> {
    await this.db.catalogItems.update(id, updates);

    const household = useAuthStore.getState().household;
    if (household) {
      remoteCatalogRepository.updateCatalogItem(id, updates).catch(() => {
        syncManager.enqueueOp('catalog_items', 'update', id, updates);
      });
    }
  }

  async deleteCatalogItem(id: string): Promise<void> {
    await this.db.transaction('rw', [this.db.catalogItems, this.db.favorites, this.db.itemAliases], async () => {
      await this.db.catalogItems.delete(id);
      await this.db.favorites.where('catalogItemId').equals(id).delete();
      await this.db.itemAliases.where('catalogItemId').equals(id).delete();
    });

    const household = useAuthStore.getState().household;
    if (household) {
      remoteCatalogRepository.deleteCatalogItem(id).catch(() => {
        syncManager.enqueueOp('catalog_items', 'delete', id, null);
      });
    }
  }

  async getItemAliases(): Promise<ItemAlias[]> {
    return this.db.itemAliases.toArray();
  }

  async getAliasesForItem(catalogItemId: string): Promise<ItemAlias[]> {
    return this.db.itemAliases.where('catalogItemId').equals(catalogItemId).toArray();
  }

  /**
   * Returns all catalog items enriched with their frequency score from recurringItemStats.
   * Items with no stat record get frequencyScore = 0.
   */
  async getItemsWithFrequencyScores(): Promise<(CatalogItem & { frequencyScore: number })[]> {
    const [items, stats] = await Promise.all([
      this.db.catalogItems.toArray(),
      this.db.recurringItemStats.toArray(),
    ]);

    const scoreMap = new Map(stats.map((s) => [s.catalogItemId, s.frequencyScore]));

    return items.map((item) => ({
      ...item,
      frequencyScore: scoreMap.get(item.id) ?? 0,
    }));
  }
}

export const catalogRepository = new CatalogRepository();
