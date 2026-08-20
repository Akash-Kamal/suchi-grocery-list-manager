export type ListStatus = 'draft' | 'finalized' | 'shopping' | 'completed';
export type ShoppingEventType = 'marked_bought' | 'unmarked' | 'quantity_changed';
export type MeasurementSystem = 'metric' | 'imperial' | 'household';

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  icon: string;
}

export interface CatalogItem {
  id: string;
  categoryId: string;
  name: string;
  defaultUnit: string;
  isCustom: boolean;
  barcode?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

export interface ItemAlias {
  id: string;
  catalogItemId: string;
  aliasText: string;
  locale: string;
}

export interface GroceryList {
  id: string;
  title: string;
  listMonth: string; // e.g. "2026-08" or ISO date string for month querying
  status: ListStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem {
  id: string;
  listId: string;
  catalogItemId: string | null;
  itemNameSnapshot: string;
  quantity: number;
  unit: string;
  estimatedPrice: number | null;
  actualPrice: number | null;
  isPurchased: boolean;
  note: string | null;
  sortOrder: number;
}

export interface ShoppingSession {
  id: string;
  listId: string;
  startedAt: string;
  completedAt: string | null;
}

export interface ShoppingSessionEvent {
  id: string;
  sessionId: string;
  listItemId: string;
  eventType: ShoppingEventType;
  timestamp: string;
}

export interface Favorite {
  id: string;
  catalogItemId: string;
}

export interface RecurringItemStat {
  id: string;
  catalogItemId: string;
  frequencyScore: number;
  medianQuantity: number;
  medianUnit: string;
  lastPurchasedAt: string | null;
  typicalIntervalDays: number | null;
}

export interface UserPreference {
  id: number; // Singleton ID (e.g., 1)
  language: string;
  theme: 'light' | 'dark' | 'system';
  measurementSystem: MeasurementSystem;
  defaultStoreOrder: string[];
  budgetCeiling: number | null;
  reminderDayOfMonth: number | null;
}

export type MemberRole = 'owner' | 'member';

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  email?: string;
}

export interface HouseholdInvite {
  id: string;
  household_id: string;
  invite_code: string;
  created_by: string;
  expires_at: string;
  used_by: string | null;
}

export interface PendingSyncOp {
  id: string;
  tableName: 'grocery_lists' | 'list_items' | 'catalog_items' | 'favorites' | 'recurring_item_stats' | 'shopping_sessions' | 'shopping_session_events';
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  recordId: string;
  payload: any;
  createdAt: string;
  retryCount: number;
  householdId?: string;
  userId?: string;
}
