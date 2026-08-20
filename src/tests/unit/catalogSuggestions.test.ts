import { describe, it, expect } from 'vitest';
import {
  checkIsItemDue,
  calculateSuggestionScore,
  getSuggestedCatalogItems,
} from '../../utils/catalogSuggestions';
import type { CatalogItem, RecurringItemStat } from '../../types/database';

describe('Catalog Suggestions Unit Tests', () => {
  const fixedNow = new Date('2026-08-20T12:00:00Z').getTime();

  const sampleItems: CatalogItem[] = [
    { id: 'item-milk', categoryId: 'cat-kitchen', name: 'Fresh Milk', defaultUnit: 'L', isCustom: false, createdAt: '' },
    { id: 'item-atta', categoryId: 'cat-kitchen', name: 'Atta', defaultUnit: 'kg', isCustom: false, createdAt: '' },
    { id: 'item-rice', categoryId: 'cat-kitchen', name: 'Basmati Rice', defaultUnit: 'kg', isCustom: false, createdAt: '' },
    { id: 'item-oil', categoryId: 'cat-kitchen', name: 'Mustard Oil', defaultUnit: 'L', isCustom: false, createdAt: '' },
    { id: 'item-tea', categoryId: 'cat-beverages', name: 'Tea Leaves', defaultUnit: 'g', isCustom: false, createdAt: '' },
    { id: 'item-soap', categoryId: 'cat-personal', name: 'Soap', defaultUnit: 'pack', isCustom: false, createdAt: '' },
    { id: 'item-biscuit', categoryId: 'cat-snacks', name: 'Biscuits', defaultUnit: 'pack', isCustom: false, createdAt: '' },
    { id: 'item-salt', categoryId: 'cat-kitchen', name: 'Salt', defaultUnit: 'kg', isCustom: false, createdAt: '' },
    { id: 'item-sugar', categoryId: 'cat-kitchen', name: 'Sugar', defaultUnit: 'kg', isCustom: false, createdAt: '' },
    { id: 'item-dahi', categoryId: 'cat-kitchen', name: 'Dahi', defaultUnit: 'kg', isCustom: false, createdAt: '' },
  ];

  describe('Due Indicator (checkIsItemDue)', () => {
    it('marks item as due when lastPurchasedAt + typicalIntervalDays <= now', () => {
      // Purchased 10 days ago, typical interval is 7 days -> Due
      const lastPurchased = new Date(fixedNow - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(checkIsItemDue(lastPurchased, 7, fixedNow)).toBe(true);
    });

    it('does not mark item as due when lastPurchasedAt + typicalIntervalDays > now', () => {
      // Purchased 2 days ago, typical interval is 7 days -> Not Due
      const lastPurchased = new Date(fixedNow - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(checkIsItemDue(lastPurchased, 7, fixedNow)).toBe(false);
    });

    it('safely handles missing or null lastPurchasedAt', () => {
      expect(checkIsItemDue(null, 7, fixedNow)).toBe(false);
      expect(checkIsItemDue(undefined, 7, fixedNow)).toBe(false);
      expect(checkIsItemDue('', 7, fixedNow)).toBe(false);
    });

    it('safely handles invalid date strings', () => {
      expect(checkIsItemDue('not-a-date', 7, fixedNow)).toBe(false);
    });

    it('safely handles invalid, null, or zero typicalIntervalDays', () => {
      const lastPurchased = new Date(fixedNow - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(checkIsItemDue(lastPurchased, null, fixedNow)).toBe(false);
      expect(checkIsItemDue(lastPurchased, 0, fixedNow)).toBe(false);
      expect(checkIsItemDue(lastPurchased, -5, fixedNow)).toBe(false);
      expect(checkIsItemDue(lastPurchased, NaN, fixedNow)).toBe(false);
    });

    it('does not mark future purchase dates as due', () => {
      // Future date
      const futureDate = new Date(fixedNow + 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(checkIsItemDue(futureDate, 1, fixedNow)).toBe(false);
    });
  });

  describe('Suggestion Scoring & Ranking (getSuggestedCatalogItems)', () => {
    it('ranks frequently purchased items highly', () => {
      const stats: RecurringItemStat[] = [
        { id: '1', catalogItemId: 'item-milk', frequencyScore: 0.9, medianQuantity: 2, medianUnit: 'L', lastPurchasedAt: null, typicalIntervalDays: null },
        { id: '2', catalogItemId: 'item-atta', frequencyScore: 0.3, medianQuantity: 5, medianUnit: 'kg', lastPurchasedAt: null, typicalIntervalDays: null },
      ];

      const suggestions = getSuggestedCatalogItems(sampleItems, stats, new Set(), { now: fixedNow });
      expect(suggestions[0].item.id).toBe('item-milk');
      expect(suggestions[1].item.id).toBe('item-atta');
    });

    it('gives due items a substantial boost', () => {
      const stats: RecurringItemStat[] = [
        // Milk: frequency 0.5, but DUE (purchased 10 days ago, interval 7 days)
        { id: '1', catalogItemId: 'item-milk', frequencyScore: 0.5, medianQuantity: 1, medianUnit: 'L', lastPurchasedAt: new Date(fixedNow - 10 * 24 * 60 * 60 * 1000).toISOString(), typicalIntervalDays: 7 },
        // Atta: frequency 0.6, not due
        { id: '2', catalogItemId: 'item-atta', frequencyScore: 0.6, medianQuantity: 5, medianUnit: 'kg', lastPurchasedAt: null, typicalIntervalDays: null },
      ];

      const suggestions = getSuggestedCatalogItems(sampleItems, stats, new Set(), { now: fixedNow });
      expect(suggestions[0].item.id).toBe('item-milk');
      expect(suggestions[0].isDue).toBe(true);
    });

    it('allows favorite status to boost ranking', () => {
      const stats: RecurringItemStat[] = [
        { id: '1', catalogItemId: 'item-milk', frequencyScore: 0.4, medianQuantity: 1, medianUnit: 'L', lastPurchasedAt: null, typicalIntervalDays: null },
        { id: '2', catalogItemId: 'item-atta', frequencyScore: 0.4, medianQuantity: 5, medianUnit: 'kg', lastPurchasedAt: null, typicalIntervalDays: null },
      ];
      // Atta is a favorite (+15 boost)
      const favorites = new Set(['item-atta']);

      const suggestions = getSuggestedCatalogItems(sampleItems, stats, favorites, { now: fixedNow });
      expect(suggestions[0].item.id).toBe('item-atta');
      expect(suggestions[0].isFavorite).toBe(true);
    });

    it('applies recent purchase boost within 45 days', () => {
      const item = sampleItems[0];
      const recentDate = new Date(fixedNow - 5 * 24 * 60 * 60 * 1000).toISOString();
      const oldDate = new Date(fixedNow - 60 * 24 * 60 * 60 * 1000).toISOString();

      const statRecent: RecurringItemStat = { id: '1', catalogItemId: item.id, frequencyScore: 0.5, medianQuantity: 1, medianUnit: 'L', lastPurchasedAt: recentDate, typicalIntervalDays: null };
      const statOld: RecurringItemStat = { id: '2', catalogItemId: item.id, frequencyScore: 0.5, medianQuantity: 1, medianUnit: 'L', lastPurchasedAt: oldDate, typicalIntervalDays: null };

      const scoreRecent = calculateSuggestionScore(item, statRecent, false, fixedNow);
      const scoreOld = calculateSuggestionScore(item, statOld, false, fixedNow);

      expect(scoreRecent.score).toBeGreaterThan(scoreOld.score);
    });

    it('does not give no-history items any fake score or fabricate suggestions for new users', () => {
      // No stats, no favorites -> 0 suggestions returned
      const suggestions = getSuggestedCatalogItems(sampleItems, [], new Set(), { now: fixedNow });
      expect(suggestions).toEqual([]);
    });

    it('handles empty catalog gracefully', () => {
      const suggestions = getSuggestedCatalogItems([], [], new Set(), { now: fixedNow });
      expect(suggestions).toEqual([]);
    });

    it('limits suggestions to maximum of 8 by default', () => {
      const stats: RecurringItemStat[] = sampleItems.map((item, idx) => ({
        id: `stat-${idx}`,
        catalogItemId: item.id,
        frequencyScore: 0.8 - idx * 0.05,
        medianQuantity: 1,
        medianUnit: 'kg',
        lastPurchasedAt: null,
        typicalIntervalDays: null,
      }));

      const suggestions = getSuggestedCatalogItems(sampleItems, stats, new Set(), { now: fixedNow });
      expect(suggestions.length).toBe(8);
      // No duplicate items
      const ids = suggestions.map((s) => s.item.id);
      expect(ids.length).toBe(new Set(ids).size);
    });

    it('uses stable catalog order as final tie-breaker for equal scores', () => {
      const stats: RecurringItemStat[] = [
        { id: '1', catalogItemId: 'item-milk', frequencyScore: 0.5, medianQuantity: 1, medianUnit: 'L', lastPurchasedAt: null, typicalIntervalDays: null },
        { id: '2', catalogItemId: 'item-atta', frequencyScore: 0.5, medianQuantity: 1, medianUnit: 'kg', lastPurchasedAt: null, typicalIntervalDays: null },
      ];

      const suggestions = getSuggestedCatalogItems(sampleItems, stats, new Set(), { now: fixedNow });
      // item-milk comes before item-atta in sampleItems, so it should rank first on tie
      expect(suggestions[0].item.id).toBe('item-milk');
      expect(suggestions[1].item.id).toBe('item-atta');
    });

    it('allows a user with only favorites to see their favorites in suggestions', () => {
      const favorites = new Set(['item-rice', 'item-oil']);
      const suggestions = getSuggestedCatalogItems(sampleItems, [], favorites, { now: fixedNow });

      expect(suggestions.length).toBe(2);
      expect(suggestions.map((s) => s.item.id)).toEqual(['item-rice', 'item-oil']);
    });
  });
});
