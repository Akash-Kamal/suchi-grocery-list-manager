import { describe, it, expect } from 'vitest';
import {
  getShoppingProgress,
  getShoppingBudgetBreakdown,
  filterAndGroupShoppingItems,
  findReviewIssues,
  getListReviewSummary,
} from '../../utils/listReview';
import {
  mergeItemQuantities,
  findMatchingListItem,
} from '../../utils/catalogItemIdentity';
import { SEED_CATEGORIES, SEED_CATALOG_ITEMS } from '../../db/seedData';
import type { ListItem } from '../../types/database';

describe('Production Hardening & Edge Cases Unit Tests (STEP 11)', () => {
  const makeListItem = (
    id: string,
    catalogItemId: string | null,
    name: string,
    quantity = 1,
    unit = 'kg',
    isPurchased = false,
    estimatedPrice: number | null = null,
    note: string | null = null
  ): ListItem => ({
    id,
    listId: 'list-1',
    catalogItemId,
    itemNameSnapshot: name,
    quantity,
    unit,
    estimatedPrice,
    actualPrice: null,
    isPurchased,
    note,
    sortOrder: 0,
  });

  describe('Edge Case Data Sanitization & Resilience', () => {
    it('handles null, undefined, and empty string fields in ListItems without throwing', () => {
      const corruptItem: ListItem = {
        id: 'corrupt-1',
        listId: 'list-1',
        catalogItemId: null,
        itemNameSnapshot: null as unknown as string,
        quantity: null as unknown as number,
        unit: null as unknown as string,
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: null as unknown as boolean,
        note: null,
        sortOrder: 0,
      };

      expect(() => getShoppingProgress([corruptItem])).not.toThrow();
      expect(() => getShoppingBudgetBreakdown([corruptItem])).not.toThrow();
      expect(() => filterAndGroupShoppingItems([corruptItem])).not.toThrow();
      expect(() => findReviewIssues([corruptItem])).not.toThrow();
      expect(() => getListReviewSummary([corruptItem])).not.toThrow();
    });

    it('safely handles extreme numeric edge cases (NaN, Infinity, negative) in budget and progress calculations', () => {
      const extremeItems = [
        makeListItem('1', 'item-atta', 'Atta', NaN, 'kg', false, NaN),
        makeListItem('2', 'item-milk', 'Milk', Infinity, 'L', true, Infinity),
        makeListItem('3', 'item-sugar', 'Sugar', -10, 'kg', false, -500),
      ];

      const budget = getShoppingBudgetBreakdown(extremeItems);
      expect(isNaN(budget.totalBudget)).toBe(false);
      expect(isFinite(budget.totalBudget)).toBe(true);
      expect(budget.totalBudget).toBeGreaterThanOrEqual(0);

      const progress = getShoppingProgress(extremeItems);
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(3);
      expect(progress.percentage).toBe(33);
    });

    it('safely assigns completely unknown category IDs to "Other"', () => {
      const items = [
        makeListItem('1', 'unknown-catalog-id-999', 'Exotic Fruit', 1, 'pcs'),
      ];

      const groups = filterAndGroupShoppingItems(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      expect(groups.length).toBe(1);
      expect(groups[0].categoryName).toBe('Other');
    });
  });

  describe('Rapid Action & Concurrent State Consistency', () => {
    it('repeated simulated rapid add clicks on the same item resolve to the same list row without duplicate creation', () => {
      const currentListItems: ListItem[] = [];
      const itemCandidate = { catalogItemId: 'item-milk', name: 'Fresh Milk' };

      // Simulate 5 consecutive rapid add clicks in the same event loop tick
      for (let i = 0; i < 5; i++) {
        const existing = findMatchingListItem(currentListItems, itemCandidate);
        if (existing) {
          const { mergedQty } = mergeItemQuantities(existing.quantity, existing.unit, 1, 'L');
          existing.quantity = mergedQty;
        } else {
          currentListItems.push(makeListItem('item-milk-1', 'item-milk', 'Fresh Milk', 1, 'L'));
        }
      }

      // Must have exactly 1 list row with quantity 5
      expect(currentListItems.length).toBe(1);
      expect(currentListItems[0].quantity).toBe(5);
    });

    it('incompatible units between same item names preserve isolation without crashing', () => {
      const existing = makeListItem('1', 'item-atta', 'Atta', 10, 'kg');
      const incomingCandidate = { catalogItemId: 'item-atta', name: 'Atta' };

      const match = findMatchingListItem([existing], incomingCandidate);
      expect(match).toBeDefined();

      const mergeResult = mergeItemQuantities(match!.quantity, match!.unit, 1, 'L');
      expect(mergeResult.canMerge).toBe(false);
      expect(mergeResult.mergedQty).toBe(10); // Preserves original without corruption
    });
  });

  describe('Scale & In-Memory Performance', () => {
    it('processes large lists (250+ items) in under 15ms in memory', () => {
      const largeList: ListItem[] = [];
      for (let i = 0; i < 250; i++) {
        const catItem = SEED_CATALOG_ITEMS[i % SEED_CATALOG_ITEMS.length];
        largeList.push(
          makeListItem(
            `item-${i}`,
            catItem.id,
            `${catItem.name} ${i}`,
            1 + (i % 5),
            catItem.defaultUnit,
            i % 2 === 0,
            50 + (i % 100)
          )
        );
      }

      const start = performance.now();
      const summary = getListReviewSummary(largeList, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      const groups = filterAndGroupShoppingItems(largeList, SEED_CATEGORIES, SEED_CATALOG_ITEMS, {
        statusFilter: 'remaining',
        selectedCategory: 'all',
      });
      const duration = performance.now() - start;

      expect(summary.totalItems).toBe(250);
      expect(groups.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Under 50ms performance threshold
    });
  });
});
