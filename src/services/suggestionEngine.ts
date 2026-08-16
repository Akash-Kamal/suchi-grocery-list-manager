export interface HistoryRecord {
  quantity: number;
  unit: string;
  listMonth: string;
  purchasedAt: string;
}

export interface RecurringCandidate {
  catalogItemId: string;
  name: string;
  defaultUnit: string;
  categoryId: string;
  frequencyScore: number;
  medianQuantity: number;
  medianUnit: string;
  lastPurchasedAt: string | null;
}

export interface GapSuggestion {
  catalogItemId: string;
  name: string;
  defaultUnit: string;
  categoryId: string;
  frequencyScore: number;
  suggestedQuantity: number;
  reason: string;
}

export interface UnusualQuantityFlag {
  isUnusual: boolean;
  delta: number;
  ratio: number;
  message: string | null;
}

/**
 * Calculates a frequency score between 0.0 and 1.0 based on past list appearances.
 * @param occurrences Number of lists this item appeared in
 * @param totalLists Total number of past finalized lists evaluated
 */
export function calculateFrequencyScore(occurrences: number, totalLists: number): number {
  if (totalLists <= 0 || occurrences <= 0) return 0;
  const score = occurrences / totalLists;
  return Math.min(1, Math.max(0, Math.round(score * 100) / 100));
}

/**
 * Calculates the median quantity from an array of historical purchase quantities.
 * Returns 1 if array is empty or invalid.
 */
export function calculateMedianQuantity(quantities: number[]): number {
  if (!quantities || quantities.length === 0) return 1;
  
  const valid = quantities.filter((q) => typeof q === 'number' && !isNaN(q) && q > 0);
  if (valid.length === 0) return 1;

  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Identifies high-recurring items that are missing from the current draft list.
 */
export function detectGaps(
  currentDraftCatalogItemIds: Set<string>,
  recurringCandidates: RecurringCandidate[],
  minFrequencyThreshold = 0.4
): GapSuggestion[] {
  const gaps: GapSuggestion[] = [];

  for (const candidate of recurringCandidates) {
    if (
      candidate.frequencyScore >= minFrequencyThreshold &&
      !currentDraftCatalogItemIds.has(candidate.catalogItemId)
    ) {
      gaps.push({
        catalogItemId: candidate.catalogItemId,
        name: candidate.name,
        defaultUnit: candidate.medianUnit || candidate.defaultUnit,
        categoryId: candidate.categoryId,
        frequencyScore: candidate.frequencyScore,
        suggestedQuantity: candidate.medianQuantity || 1,
        reason: `Bought in ${Math.round(candidate.frequencyScore * 100)}% of past lists`,
      });
    }
  }

  // Sort by highest frequency score first
  return gaps.sort((a, b) => b.frequencyScore - a.frequencyScore);
}

/**
 * Flags whether a current draft quantity is unusually high or low compared to historical median.
 */
export function flagUnusualQuantity(
  currentQty: number,
  historicalMedian: number
): UnusualQuantityFlag {
  if (!historicalMedian || historicalMedian <= 0 || currentQty <= 0) {
    return { isUnusual: false, delta: 0, ratio: 1, message: null };
  }

  const ratio = currentQty / historicalMedian;
  const delta = currentQty - historicalMedian;

  if (ratio >= 2.0) {
    return {
      isUnusual: true,
      delta,
      ratio,
      message: `${currentQty} is ${ratio.toFixed(1)}x your usual quantity (${historicalMedian})`,
    };
  }

  if (ratio <= 0.33 && historicalMedian >= 3) {
    return {
      isUnusual: true,
      delta,
      ratio,
      message: `${currentQty} is significantly lower than your usual ${historicalMedian}`,
    };
  }

  return { isUnusual: false, delta, ratio, message: null };
}
