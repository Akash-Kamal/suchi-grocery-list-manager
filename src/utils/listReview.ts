import { SEED_CATEGORIES, SEED_CATALOG_ITEMS } from '../db/seedData';
import type { Category, CatalogItem, ListItem } from '../types/database';
import { normalizeItemName, normalizeUnit } from './catalogItemIdentity';

export interface ShoppingProgress {
  total: number;
  completed: number;
  remaining: number;
  percentage: number;
}

export interface ReviewIssue {
  itemId: string;
  itemName: string;
  type: 'empty_name' | 'invalid_quantity' | 'missing_unit' | 'duplicate_item' | 'uncategorized';
  message: string;
}

export interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  sortOrder: number;
  items: ListItem[];
}

export interface ListReviewSummary {
  totalItems: number;
  categoryCount: number;
  purchasedCount: number;
  remainingCount: number;
  completionPercentage: number;
  estimatedBudget: number;
  categoryGroups: CategoryGroup[];
  issues: ReviewIssue[];
}

const DEFAULT_CATEGORY_LOOKUP = new Map<string, Category>(
  SEED_CATEGORIES.map((c) => [c.id, c])
);

const DEFAULT_CATALOG_LOOKUP = new Map<string, CatalogItem>(
  SEED_CATALOG_ITEMS.map((item) => [item.id, item])
);

/**
 * Pure, deterministic calculation of shopping progress.
 */
export function getShoppingProgress(items?: ListItem[] | null): ShoppingProgress {
  if (!items || items.length === 0) {
    return {
      total: 0,
      completed: 0,
      remaining: 0,
      percentage: 0,
    };
  }

  const total = items.length;
  let completed = 0;

  for (const item of items) {
    if (item && item.isPurchased === true) {
      completed += 1;
    }
  }

  const remaining = Math.max(0, total - completed);
  const rawPercentage = total > 0 ? (completed / total) * 100 : 0;
  const percentage = Math.min(100, Math.max(0, Math.round(rawPercentage)));

  return {
    total,
    completed,
    remaining,
    percentage,
  };
}

/**
 * Pure, deterministic check for list review warnings.
 * Does NOT mutate or delete data.
 */
export function findReviewIssues(
  items?: ListItem[] | null,
  catalogItems?: CatalogItem[]
): ReviewIssue[] {
  if (!items || items.length === 0) {
    return [];
  }

  const issues: ReviewIssue[] = [];
  const catalogMap = catalogItems
    ? new Map(catalogItems.map((c) => [c.id, c]))
    : DEFAULT_CATALOG_LOOKUP;

  const seenNormalizedNames = new Map<string, string[]>(); // normName -> [itemIds]

  for (const item of items) {
    if (!item) continue;

    const rawName = item.itemNameSnapshot || '';
    const normName = normalizeItemName(rawName);
    const displayName = rawName.trim() || 'Unnamed Item';

    // 1. Empty / whitespace-only name
    if (!normName) {
      issues.push({
        itemId: item.id,
        itemName: displayName,
        type: 'empty_name',
        message: 'Item name is empty',
      });
    }

    // 2. Invalid quantity (NaN, non-finite, <= 0)
    if (
      typeof item.quantity !== 'number' ||
      isNaN(item.quantity) ||
      !isFinite(item.quantity) ||
      item.quantity <= 0
    ) {
      issues.push({
        itemId: item.id,
        itemName: displayName,
        type: 'invalid_quantity',
        message: 'Missing or invalid quantity',
      });
    }

    // 3. Missing unit
    const normUnit = normalizeUnit(item.unit);
    if (!normUnit) {
      issues.push({
        itemId: item.id,
        itemName: displayName,
        type: 'missing_unit',
        message: 'Measurement unit is missing',
      });
    }

    // 4. Uncategorized custom item
    if (!item.catalogItemId || !catalogMap.has(item.catalogItemId)) {
      issues.push({
        itemId: item.id,
        itemName: displayName,
        type: 'uncategorized',
        message: 'Custom item without catalog category',
      });
    }

    // 5. Track for duplicate name warnings
    if (normName) {
      const list = seenNormalizedNames.get(normName) || [];
      list.push(item.id);
      seenNormalizedNames.set(normName, list);
    }
  }

  // Check for duplicate name warnings
  for (const [normName, ids] of seenNormalizedNames.entries()) {
    if (ids.length > 1) {
      for (const id of ids) {
        const item = items.find((i) => i.id === id);
        issues.push({
          itemId: id,
          itemName: item?.itemNameSnapshot?.trim() || normName,
          type: 'duplicate_item',
          message: `Multiple entries for "${item?.itemNameSnapshot?.trim() || normName}" found in list`,
        });
      }
    }
  }

  return issues;
}

/**
 * Pure, deterministic category grouping for grocery list items.
 * Preserves user item order within each category.
 */
export function groupListItemsByCategory(
  items?: ListItem[] | null,
  categories?: Category[],
  catalogItems?: CatalogItem[]
): CategoryGroup[] {
  if (!items || items.length === 0) {
    return [];
  }

  const catLookup = categories
    ? new Map(categories.map((c) => [c.id, c]))
    : DEFAULT_CATEGORY_LOOKUP;

  const catalogLookup = catalogItems
    ? new Map(catalogItems.map((c) => [c.id, c]))
    : DEFAULT_CATALOG_LOOKUP;

  // Map categoryId -> ListItem[]
  const groupsMap = new Map<string, ListItem[]>();

  for (const item of items) {
    if (!item) continue;

    let catId = 'cat-misc';
    if (item.catalogItemId) {
      const catItem = catalogLookup.get(item.catalogItemId);
      if (catItem && catItem.categoryId) {
        catId = catItem.categoryId;
      }
    }

    const groupList = groupsMap.get(catId) || [];
    groupList.push(item);
    groupsMap.set(catId, groupList);
  }

  // Convert to CategoryGroup array with stable deterministic order
  const result: CategoryGroup[] = [];

  // 1. Defined categories in sortOrder
  const allKnownCategories = categories || SEED_CATEGORIES;
  const sortedCategories = [...allKnownCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  for (const cat of sortedCategories) {
    const groupItems = groupsMap.get(cat.id);
    if (groupItems && groupItems.length > 0) {
      result.push({
        categoryId: cat.id,
        categoryName: cat.id === 'cat-misc' ? 'Other' : cat.name,
        sortOrder: cat.sortOrder || 99,
        items: groupItems,
      });
      groupsMap.delete(cat.id);
    }
  }

  // 2. Any remaining categories (e.g. unknown catId)
  for (const [catId, groupItems] of groupsMap.entries()) {
    if (groupItems && groupItems.length > 0) {
      const cat = catLookup.get(catId);
      result.push({
        categoryId: catId,
        categoryName: cat ? (cat.id === 'cat-misc' ? 'Other' : cat.name) : 'Other',
        sortOrder: cat?.sortOrder || 999,
        items: groupItems,
      });
    }
  }

  return result;
}

/**
 * Pure, deterministic complete list review summary.
 */
export function getListReviewSummary(
  items?: ListItem[] | null,
  categories?: Category[],
  catalogItems?: CatalogItem[]
): ListReviewSummary {
  if (!items || items.length === 0) {
    return {
      totalItems: 0,
      categoryCount: 0,
      purchasedCount: 0,
      remainingCount: 0,
      completionPercentage: 0,
      estimatedBudget: 0,
      categoryGroups: [],
      issues: [],
    };
  }

  const progress = getShoppingProgress(items);
  const categoryGroups = groupListItemsByCategory(items, categories, catalogItems);
  const issues = findReviewIssues(items, catalogItems);

  let estimatedBudget = 0;
  for (const item of items) {
    if (
      item &&
      typeof item.estimatedPrice === 'number' &&
      !isNaN(item.estimatedPrice) &&
      isFinite(item.estimatedPrice) &&
      item.estimatedPrice > 0
    ) {
      const qty =
        typeof item.quantity === 'number' &&
        !isNaN(item.quantity) &&
        isFinite(item.quantity) &&
        item.quantity > 0
          ? item.quantity
          : 1;
      estimatedBudget += item.estimatedPrice * qty;
    }
  }

  return {
    totalItems: progress.total,
    categoryCount: categoryGroups.length,
    purchasedCount: progress.completed,
    remainingCount: progress.remaining,
    completionPercentage: progress.percentage,
    estimatedBudget,
    categoryGroups,
    issues,
  };
}

export interface ShoppingBudgetBreakdown {
  totalBudget: number;
  purchasedBudget: number;
  remainingBudget: number;
}

export interface ShoppingFilterOptions {
  statusFilter: 'all' | 'remaining' | 'purchased';
  selectedCategory: string; // 'all' or categoryId
  searchQuery?: string;
}

/**
 * Calculates estimated budget breakdown for shopping (total, purchased, and remaining).
 */
export function getShoppingBudgetBreakdown(items?: ListItem[] | null): ShoppingBudgetBreakdown {
  if (!items || items.length === 0) {
    return { totalBudget: 0, purchasedBudget: 0, remainingBudget: 0 };
  }

  let totalBudget = 0;
  let purchasedBudget = 0;
  let remainingBudget = 0;

  for (const item of items) {
    if (!item) continue;
    const price =
      typeof item.estimatedPrice === 'number' &&
      !isNaN(item.estimatedPrice) &&
      isFinite(item.estimatedPrice) &&
      item.estimatedPrice > 0
        ? item.estimatedPrice
        : 0;
    const qty =
      typeof item.quantity === 'number' &&
      !isNaN(item.quantity) &&
      isFinite(item.quantity) &&
      item.quantity > 0
        ? item.quantity
        : 1;

    const itemTotal = price * qty;
    totalBudget += itemTotal;
    if (item.isPurchased) {
      purchasedBudget += itemTotal;
    } else {
      remainingBudget += itemTotal;
    }
  }

  return {
    totalBudget,
    purchasedBudget,
    remainingBudget,
  };
}

/**
 * Filters and groups shopping items by status, category, and search query.
 * Always orders unpurchased items before purchased items within each category group.
 */
export function filterAndGroupShoppingItems(
  items: ListItem[] | null | undefined,
  categories?: Category[],
  catalogItems?: CatalogItem[],
  options?: Partial<ShoppingFilterOptions>
): CategoryGroup[] {
  if (!items || items.length === 0) {
    return [];
  }

  const statusFilter = options?.statusFilter || 'all';
  const selectedCategory = options?.selectedCategory || 'all';
  const query = options?.searchQuery?.trim().toLowerCase() || '';

  // 1. Filter by search query
  let filtered = items;
  if (query) {
    filtered = filtered.filter((i) =>
      i.itemNameSnapshot.toLowerCase().includes(query)
    );
  }

  // 2. Filter by purchased status
  if (statusFilter === 'remaining') {
    filtered = filtered.filter((i) => !i.isPurchased);
  } else if (statusFilter === 'purchased') {
    filtered = filtered.filter((i) => i.isPurchased);
  }

  // 3. Group by category
  const groups = groupListItemsByCategory(filtered, categories, catalogItems);

  // 4. Filter by category
  let categoryFilteredGroups = groups;
  if (selectedCategory !== 'all') {
    categoryFilteredGroups = groups.filter((g) => g.categoryId === selectedCategory);
  }

  // 5. Ensure unpurchased items come first within each group
  return categoryFilteredGroups.map((group) => {
    const unpurchased = group.items.filter((i) => !i.isPurchased);
    const purchased = group.items.filter((i) => i.isPurchased);
    return {
      ...group,
      items: [...unpurchased, ...purchased],
    };
  });
}

/**
 * Sorts items for shopping mode:
 * Grouped by category order, with unpurchased items first within each category.
 */
export function sortListItemsForShopping(
  items?: ListItem[] | null,
  categories?: Category[],
  catalogItems?: CatalogItem[]
): ListItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  const groups = filterAndGroupShoppingItems(items, categories, catalogItems, { statusFilter: 'all' });
  return groups.flatMap((g) => g.items);
}
