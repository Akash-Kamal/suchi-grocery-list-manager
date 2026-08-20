import type { CatalogItem, RecurringItemStat } from '../types/database';

export interface CatalogSuggestion {
  item: CatalogItem;
  score: number;
  isDue: boolean;
  isFavorite: boolean;
  frequencyScore: number;
  reason?: string;
}

export interface SuggestionOptions {
  limit?: number; // default: 8
  now?: Date | number; // optional timestamp for deterministic evaluation
}

/**
 * Checks whether an item is due for purchase based on lastPurchasedAt and typicalIntervalDays.
 */
export function checkIsItemDue(
  lastPurchasedAt: string | null | undefined,
  typicalIntervalDays: number | null | undefined,
  nowMs: number
): boolean {
  if (!lastPurchasedAt || typeof typicalIntervalDays !== 'number' || isNaN(typicalIntervalDays) || typicalIntervalDays <= 0) {
    return false;
  }

  const lastPurchasedMs = new Date(lastPurchasedAt).getTime();
  if (isNaN(lastPurchasedMs)) {
    return false;
  }

  // Future dates are invalid for due calculation
  if (lastPurchasedMs > nowMs) {
    return false;
  }

  const intervalMs = typicalIntervalDays * 24 * 60 * 60 * 1000;
  return lastPurchasedMs + intervalMs <= nowMs;
}

/**
 * Calculates a deterministic suggestion score for a catalog item based on:
 * 1. Frequency score (up to 50 pts)
 * 2. Due status (30 pts)
 * 3. Favorite status (15 pts)
 * 4. Recent purchase within 45 days (up to 10 pts)
 */
export function calculateSuggestionScore(
  _item: CatalogItem,
  stat: RecurringItemStat | undefined,
  isFavorite: boolean,
  nowMs: number
): { score: number; isDue: boolean; frequencyScore: number } {
  let score = 0;
  const frequencyScore = stat?.frequencyScore ?? 0;
  const isDue = checkIsItemDue(stat?.lastPurchasedAt, stat?.typicalIntervalDays, nowMs);

  // 1. Frequency points
  if (frequencyScore > 0) {
    score += Math.min(50, Math.round(frequencyScore * 50));
  }

  // 2. Due boost
  if (isDue) {
    score += 30;
  }

  // 3. Favorite boost
  if (isFavorite) {
    score += 15;
  }

  // 4. Recency boost (within 45 days)
  if (stat?.lastPurchasedAt) {
    const lastPurchasedMs = new Date(stat.lastPurchasedAt).getTime();
    if (!isNaN(lastPurchasedMs) && lastPurchasedMs <= nowMs) {
      const daysSince = (nowMs - lastPurchasedMs) / (24 * 60 * 60 * 1000);
      if (daysSince >= 0 && daysSince <= 45) {
        score += Math.max(0, Math.round(10 * (1 - daysSince / 45)));
      }
    }
  }

  return { score, isDue, frequencyScore };
}

/**
 * Pure, deterministic utility to rank catalog items for "Suggested for You".
 *
 * Rules:
 * - Items with no history and no favorite status receive a score of 0 and are omitted.
 * - Results are ranked by:
 *   1. Score descending
 *   2. Is Due descending
 *   3. Frequency score descending
 *   4. Is Favorite descending
 *   5. Original catalog ordering
 * - Capped at options.limit (default 8).
 */
export function getSuggestedCatalogItems(
  catalogItems: CatalogItem[],
  recurringStats: RecurringItemStat[],
  favorites: Set<string>,
  options?: SuggestionOptions
): CatalogSuggestion[] {
  if (!catalogItems || catalogItems.length === 0) {
    return [];
  }

  const limit = options?.limit ?? 8;
  const nowMs = typeof options?.now === 'number'
    ? options.now
    : options?.now instanceof Date
    ? options.now.getTime()
    : Date.now();

  // Create lookup map of recurring stats: catalogItemId -> stat
  const statsMap = new Map<string, RecurringItemStat>();
  for (const s of recurringStats) {
    statsMap.set(s.catalogItemId, s);
  }

  interface ScoredCandidate extends CatalogSuggestion {
    originalIndex: number;
  }

  const candidates: ScoredCandidate[] = [];

  for (let i = 0; i < catalogItems.length; i++) {
    const item = catalogItems[i];
    const stat = statsMap.get(item.id);
    const isFav = favorites.has(item.id);

    const { score, isDue, frequencyScore } = calculateSuggestionScore(item, stat, isFav, nowMs);

    // Only include items with a positive score (history or favorite)
    if (score > 0) {
      candidates.push({
        item,
        score,
        isDue,
        isFavorite: isFav,
        frequencyScore,
        originalIndex: i,
      });
    }
  }

  // Deterministic sorting
  candidates.sort((a, b) => {
    // 1. Highest total score
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 2. Is Due status
    if (a.isDue !== b.isDue) {
      return a.isDue ? -1 : 1;
    }
    // 3. Frequency score
    if (b.frequencyScore !== a.frequencyScore) {
      return b.frequencyScore - a.frequencyScore;
    }
    // 4. Favorite status
    if (a.isFavorite !== b.isFavorite) {
      return a.isFavorite ? -1 : 1;
    }
    // 5. Stable original catalog ordering
    return a.originalIndex - b.originalIndex;
  });

  return candidates.slice(0, limit).map(({ item, score, isDue, isFavorite, frequencyScore, reason }) => ({
    item,
    score,
    isDue,
    isFavorite,
    frequencyScore,
    reason,
  }));
}
