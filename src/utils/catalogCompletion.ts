import type { CatalogItem, ListItem, RecurringItemStat } from '../types/database';
import { getComplementsForItem } from './catalogComplements';
import { checkIsItemDue } from './catalogSuggestions';

export interface CatalogCompletionSuggestion {
  item: CatalogItem;
  score: number;
  contextScore: number;
  matchedWith: string[];
  isDue: boolean;
  isFavorite: boolean;
  frequencyScore: number;
}

export interface CompletionOptions {
  limit?: number; // default: 6
  now?: Date | number;
}

/**
 * Pure, deterministic utility to identify missing complementary catalog items
 * based on items already in the user's current grocery list.
 */
export function getContextualCatalogSuggestions(
  catalogItems: CatalogItem[],
  currentItems: ListItem[],
  recurringStats: RecurringItemStat[],
  favorites: Set<string>,
  options?: CompletionOptions
): CatalogCompletionSuggestion[] {
  if (!catalogItems || catalogItems.length === 0 || !currentItems || currentItems.length === 0) {
    return [];
  }

  const limit = options?.limit ?? 6;
  const nowMs = typeof options?.now === 'number'
    ? options.now
    : options?.now instanceof Date
    ? options.now.getTime()
    : Date.now();

  // 1. Identify all current items to exclude
  const existingCatalogIds = new Set<string>();
  const existingLowerNames = new Set<string>();
  const currentCategories = new Set<string>();

  for (const curr of currentItems) {
    if (curr.catalogItemId) {
      existingCatalogIds.add(curr.catalogItemId);
    }
    if (curr.itemNameSnapshot) {
      existingLowerNames.add(curr.itemNameSnapshot.toLowerCase().trim());
    }
  }

  // Catalog item lookup: id -> { item, originalIndex }
  const catalogMap = new Map<string, { item: CatalogItem; originalIndex: number }>();
  for (let i = 0; i < catalogItems.length; i++) {
    const itm = catalogItems[i];
    catalogMap.set(itm.id, { item: itm, originalIndex: i });
    if (existingCatalogIds.has(itm.id)) {
      currentCategories.add(itm.categoryId);
    }
  }

  // Recurring stats lookup: catalogItemId -> stat
  const statsMap = new Map<string, RecurringItemStat>();
  for (const s of recurringStats) {
    statsMap.set(s.catalogItemId, s);
  }

  // 2. Aggregate complementary candidate relationships
  // candidateId -> { matchedWith: string[], matchCount: number }
  const complementAggregator = new Map<string, { matchedWith: string[]; matchCount: number }>();

  for (const curr of currentItems) {
    if (!curr.catalogItemId) continue;

    const complementIds = getComplementsForItem(curr.catalogItemId);
    const sourceName = curr.itemNameSnapshot || 'Item';

    for (const complementId of complementIds) {
      // Exclude if already in current list
      if (existingCatalogIds.has(complementId)) continue;

      const existingEntry = complementAggregator.get(complementId);
      if (existingEntry) {
        if (!existingEntry.matchedWith.includes(sourceName)) {
          existingEntry.matchedWith.push(sourceName);
        }
        existingEntry.matchCount += 1;
      } else {
        complementAggregator.set(complementId, {
          matchedWith: [sourceName],
          matchCount: 1,
        });
      }
    }
  }

  // 3. Score and rank candidates
  interface ScoredCandidate extends CatalogCompletionSuggestion {
    originalIndex: number;
  }

  const scoredCandidates: ScoredCandidate[] = [];

  for (const [candidateId, { matchedWith, matchCount }] of complementAggregator.entries()) {
    const catalogEntry = catalogMap.get(candidateId);
    if (!catalogEntry) continue; // Unknown/missing catalog ID

    const { item, originalIndex } = catalogEntry;

    // Strict exclusion check against name snapshot duplicates
    if (existingLowerNames.has(item.name.toLowerCase().trim())) {
      continue;
    }

    // Context Score: Base 50 + 15 for each additional matching current item
    const contextScore = 50 + (matchCount - 1) * 15;

    const stat = statsMap.get(item.id);
    const frequencyScore = stat?.frequencyScore ?? 0;
    const isDue = checkIsItemDue(stat?.lastPurchasedAt, stat?.typicalIntervalDays, nowMs);
    const isFav = favorites.has(item.id);

    // Additional boosts
    const freqBoost = frequencyScore > 0 ? Math.min(20, Math.round(frequencyScore * 20)) : 0;
    const dueBoost = isDue ? 15 : 0;
    const favBoost = isFav ? 10 : 0;
    const categoryBoost = currentCategories.has(item.categoryId) ? 5 : 0;

    const totalScore = contextScore + freqBoost + dueBoost + favBoost + categoryBoost;

    scoredCandidates.push({
      item,
      score: totalScore,
      contextScore,
      matchedWith,
      isDue,
      isFavorite: isFav,
      frequencyScore,
      originalIndex,
    });
  }

  // 4. Deterministic sorting
  scoredCandidates.sort((a, b) => {
    // 1. Context relationship score descending
    if (b.contextScore !== a.contextScore) {
      return b.contextScore - a.contextScore;
    }
    // 2. Total score descending
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 3. Is Due status
    if (a.isDue !== b.isDue) {
      return a.isDue ? -1 : 1;
    }
    // 4. Frequency score descending
    if (b.frequencyScore !== a.frequencyScore) {
      return b.frequencyScore - a.frequencyScore;
    }
    // 5. Favorite status
    if (a.isFavorite !== b.isFavorite) {
      return a.isFavorite ? -1 : 1;
    }
    // 6. Stable original catalog ordering
    return a.originalIndex - b.originalIndex;
  });

  return scoredCandidates.slice(0, limit).map(({ item, score, contextScore, matchedWith, isDue, isFavorite, frequencyScore }) => ({
    item,
    score,
    contextScore,
    matchedWith,
    isDue,
    isFavorite,
    frequencyScore,
  }));
}
