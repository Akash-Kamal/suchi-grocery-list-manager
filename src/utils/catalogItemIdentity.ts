import { SEED_ITEM_ALIASES } from '../db/seedData';
import type { ListItem } from '../types/database';

/**
 * Built-in alias map for instant offline identity resolution.
 * Maps catalogItemId -> Set of lowercase aliases.
 */
const DEFAULT_ALIAS_MAP: Map<string, Set<string>> = new Map();
const ALIAS_TO_CATALOG_ID_MAP: Map<string, string> = new Map();

for (const a of SEED_ITEM_ALIASES) {
  const catId = a.catalogItemId;
  const cleanAlias = a.aliasText.trim().toLowerCase();

  let set = DEFAULT_ALIAS_MAP.get(catId);
  if (!set) {
    set = new Set();
    DEFAULT_ALIAS_MAP.set(catId, set);
  }
  set.add(cleanAlias);
  ALIAS_TO_CATALOG_ID_MAP.set(cleanAlias, catId);
}

/**
 * Normalizes item names for comparison:
 * - Trims leading/trailing whitespace
 * - Collapses internal repeated whitespace into a single space
 * - Lowercases safely
 */
export function normalizeItemName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes unit strings for comparison.
 */
export function normalizeUnit(unit?: string | null): string {
  if (!unit) return '';
  return unit.trim().toLowerCase();
}

/**
 * Checks if two units are compatible for merging quantities without conversion.
 */
export function areUnitsCompatible(unitA?: string | null, unitB?: string | null): boolean {
  const normA = normalizeUnit(unitA);
  const normB = normalizeUnit(unitB);
  if (!normA && !normB) return true;
  return normA === normB;
}

/**
 * Safely merges quantities if units are compatible.
 * Prevents NaN, Infinity, and negative numbers.
 */
export function mergeItemQuantities(
  existingQty: number,
  existingUnit: string,
  incomingQty: number,
  incomingUnit: string
): { mergedQty: number; canMerge: boolean } {
  const safeExisting = typeof existingQty === 'number' && !isNaN(existingQty) ? Math.max(0, existingQty) : 0;
  const safeIncoming = typeof incomingQty === 'number' && !isNaN(incomingQty) ? incomingQty : 0;

  if (!areUnitsCompatible(existingUnit, incomingUnit)) {
    return {
      mergedQty: safeExisting,
      canMerge: false,
    };
  }

  const mergedQty = Math.max(0, safeExisting + safeIncoming);
  return {
    mergedQty,
    canMerge: true,
  };
}

/**
 * Determines whether two items represent the same underlying grocery item.
 */
export function areItemsEquivalent(
  itemA: { catalogItemId?: string | null; name: string },
  itemB: { catalogItemId?: string | null; name: string },
  aliasMap?: Map<string, string[]>
): boolean {
  // 1. Same non-null catalogItemId -> definitely equivalent
  if (itemA.catalogItemId && itemB.catalogItemId && itemA.catalogItemId === itemB.catalogItemId) {
    return true;
  }

  const normA = normalizeItemName(itemA.name);
  const normB = normalizeItemName(itemB.name);

  // 2. Same normalized name -> equivalent
  if (normA && normB && normA === normB) {
    return true;
  }

  // 3. Alias check: if itemA has a catalogId and itemB's name is an alias for that catalogId
  if (itemA.catalogItemId) {
    const customAliases = aliasMap?.get(itemA.catalogItemId);
    if (customAliases?.some((a) => a.trim().toLowerCase() === normB)) {
      return true;
    }
    if (DEFAULT_ALIAS_MAP.get(itemA.catalogItemId)?.has(normB)) {
      return true;
    }
  }

  // 4. Alias check: if itemB has a catalogId and itemA's name is an alias for that catalogId
  if (itemB.catalogItemId) {
    const customAliases = aliasMap?.get(itemB.catalogItemId);
    if (customAliases?.some((a) => a.trim().toLowerCase() === normA)) {
      return true;
    }
    if (DEFAULT_ALIAS_MAP.get(itemB.catalogItemId)?.has(normA)) {
      return true;
    }
  }

  // 5. If both items are custom (no catalogId), check if both match the same known catalog alias
  if (!itemA.catalogItemId && !itemB.catalogItemId && normA && normB) {
    const catIdA = ALIAS_TO_CATALOG_ID_MAP.get(normA);
    const catIdB = ALIAS_TO_CATALOG_ID_MAP.get(normB);
    if (catIdA && catIdB && catIdA === catIdB) {
      return true;
    }
  }

  return false;
}

/**
 * Finds an existing list item matching the candidate item by catalogId, normalized name, or exact alias.
 */
export function findMatchingListItem(
  currentItems: ListItem[],
  candidate: { catalogItemId?: string | null; name: string },
  aliasMap?: Map<string, string[]>
): ListItem | undefined {
  if (!currentItems || currentItems.length === 0) return undefined;

  // 1. Fast O(1) matching by catalogItemId
  if (candidate.catalogItemId) {
    const match = currentItems.find((i) => i.catalogItemId === candidate.catalogItemId);
    if (match) return match;
  }

  // 2. Exact match by normalized snapshot name
  const candidateNormName = normalizeItemName(candidate.name);
  if (!candidateNormName) return undefined;

  const nameMatch = currentItems.find(
    (i) => normalizeItemName(i.itemNameSnapshot) === candidateNormName
  );
  if (nameMatch) return nameMatch;

  // 3. Check equivalence via alias matching
  return currentItems.find((existing) =>
    areItemsEquivalent(
      { catalogItemId: existing.catalogItemId, name: existing.itemNameSnapshot },
      candidate,
      aliasMap
    )
  );
}
