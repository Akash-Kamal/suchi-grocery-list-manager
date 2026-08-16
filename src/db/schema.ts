import Dexie, { type Table } from 'dexie';
import type {
  Category,
  CatalogItem,
  ItemAlias,
  GroceryList,
  ListItem,
  ShoppingSession,
  ShoppingSessionEvent,
  Favorite,
  RecurringItemStat,
  UserPreference,
  PendingSyncOp,
} from '../types/database';
import {
  SEED_CATEGORIES,
  SEED_CATALOG_ITEMS,
  SEED_ITEM_ALIASES,
  SEED_USER_PREFERENCE,
} from './seedData';

export class SuchiDatabase extends Dexie {
  categories!: Table<Category, string>;
  catalogItems!: Table<CatalogItem, string>;
  itemAliases!: Table<ItemAlias, string>;
  groceryLists!: Table<GroceryList, string>;
  listItems!: Table<ListItem, string>;
  shoppingSessions!: Table<ShoppingSession, string>;
  shoppingSessionEvents!: Table<ShoppingSessionEvent, string>;
  favorites!: Table<Favorite, string>;
  recurringItemStats!: Table<RecurringItemStat, string>;
  userPreferences!: Table<UserPreference, number>;
  pendingSyncOps!: Table<PendingSyncOp, string>;

  constructor(dbName = 'SuchiGroceryDB') {
    super(dbName);
    
    // Schema V1
    this.version(1).stores({
      categories: 'id, sortOrder',
      catalogItems: 'id, categoryId, name',
      itemAliases: 'id, catalogItemId, aliasText',
      groceryLists: 'id, listMonth, status, updatedAt',
      listItems: 'id, listId, catalogItemId',
      shoppingSessions: 'id, listId',
      shoppingSessionEvents: 'id, sessionId, listItemId, timestamp',
      favorites: 'id, &catalogItemId',
      recurringItemStats: 'id, catalogItemId, frequencyScore',
      userPreferences: 'id',
    });

    // Schema V2 - Add pending sync queue for offline write buffering
    this.version(2).stores({
      categories: 'id, sortOrder',
      catalogItems: 'id, categoryId, name',
      itemAliases: 'id, catalogItemId, aliasText',
      groceryLists: 'id, listMonth, status, updatedAt',
      listItems: 'id, listId, catalogItemId',
      shoppingSessions: 'id, listId',
      shoppingSessionEvents: 'id, sessionId, listItemId, timestamp',
      favorites: 'id, &catalogItemId',
      recurringItemStats: 'id, catalogItemId, frequencyScore',
      userPreferences: 'id',
      pendingSyncOps: 'id, tableName, createdAt',
    });
  }

  async seedIfEmpty() {
    const categoryCount = await this.categories.count();
    if (categoryCount === 0) {
      await this.transaction('rw', [
        this.categories,
        this.catalogItems,
        this.itemAliases,
        this.userPreferences,
      ], async () => {
        await this.categories.bulkAdd(SEED_CATEGORIES);
        await this.catalogItems.bulkAdd(SEED_CATALOG_ITEMS);
        await this.itemAliases.bulkAdd(SEED_ITEM_ALIASES);
        await this.userPreferences.put(SEED_USER_PREFERENCE);
      });
    }
  }
}

export const db = new SuchiDatabase();
