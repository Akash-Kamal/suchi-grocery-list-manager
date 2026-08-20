import { describe, it, expect } from 'vitest';
import {
  getShoppingProgress,
  findReviewIssues,
  groupListItemsByCategory,
  getListReviewSummary,
  sortListItemsForShopping,
} from '../../utils/listReview';
import { SEED_CATEGORIES, SEED_CATALOG_ITEMS } from '../../db/seedData';
import type { ListItem } from '../../types/database';

describe('Smart List Review & Shopping Readiness Unit Tests', () => {
  const makeListItem = (
    id: string,
    catalogItemId: string | null,
    name: string,
    quantity = 1,
    unit = 'kg',
    isPurchased = false,
    estimatedPrice: number | null = null
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
    note: null,
    sortOrder: 0,
  });

  describe('Shopping Progress (getShoppingProgress)', () => {
    it('handles empty and null list gracefully with 0 progress', () => {
      expect(getShoppingProgress([])).toEqual({ total: 0, completed: 0, remaining: 0, percentage: 0 });
      expect(getShoppingProgress(null)).toEqual({ total: 0, completed: 0, remaining: 0, percentage: 0 });
    });

    it('calculates total, completed, remaining, and percentage accurately', () => {
      const items = [
        makeListItem('1', 'item-milk', 'Milk', 2, 'L', true),
        makeListItem('2', 'item-atta', 'Atta', 10, 'kg', false),
        makeListItem('3', 'item-sugar', 'Sugar', 1, 'kg', true),
        makeListItem('4', 'item-salt', 'Salt', 1, 'kg', false),
      ];

      const progress = getShoppingProgress(items);
      expect(progress.total).toBe(4);
      expect(progress.completed).toBe(2);
      expect(progress.remaining).toBe(2);
      expect(progress.percentage).toBe(50);
    });

    it('clamps percentage safely between 0 and 100', () => {
      const allDone = [
        makeListItem('1', 'item-milk', 'Milk', 1, 'L', true),
        makeListItem('2', 'item-sugar', 'Sugar', 1, 'kg', true),
      ];
      expect(getShoppingProgress(allDone).percentage).toBe(100);

      const noneDone = [
        makeListItem('1', 'item-milk', 'Milk', 1, 'L', false),
      ];
      expect(getShoppingProgress(noneDone).percentage).toBe(0);
    });
  });

  describe('Review Issues Detection (findReviewIssues)', () => {
    it('returns empty array when items have no issues', () => {
      const validItems = [
        makeListItem('1', 'item-atta', 'Chakki Fresh Atta', 10, 'kg'),
        makeListItem('2', 'item-milk', 'Fresh Milk', 2, 'L'),
      ];

      const issues = findReviewIssues(validItems, SEED_CATALOG_ITEMS);
      expect(issues).toEqual([]);
    });

    it('detects empty item names', () => {
      const items = [makeListItem('1', 'item-atta', '   ', 10, 'kg')];
      const issues = findReviewIssues(items);
      expect(issues.some((i) => i.type === 'empty_name')).toBe(true);
    });

    it('detects invalid, negative, NaN, and zero quantities', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 0, 'kg'),
        makeListItem('2', 'item-milk', 'Milk', -2, 'L'),
        makeListItem('3', 'item-sugar', 'Sugar', NaN, 'kg'),
        makeListItem('4', 'item-salt', 'Salt', Infinity, 'kg'),
      ];

      const issues = findReviewIssues(items);
      const qtyIssues = issues.filter((i) => i.type === 'invalid_quantity');
      expect(qtyIssues.length).toBe(4);
    });

    it('detects missing or whitespace-only measurement units', () => {
      const items = [makeListItem('1', 'item-milk', 'Milk', 2, '  ')];
      const issues = findReviewIssues(items);
      expect(issues.some((i) => i.type === 'missing_unit')).toBe(true);
    });

    it('detects custom items without catalog category as uncategorized review warning', () => {
      const items = [makeListItem('1', null, 'Homemade Chutney', 1, 'pack')];
      const issues = findReviewIssues(items, SEED_CATALOG_ITEMS);
      expect(issues.some((i) => i.type === 'uncategorized')).toBe(true);
    });

    it('detects duplicate items in list without mutating original items', () => {
      const items = [
        makeListItem('1', 'item-milk', 'Fresh Milk', 1, 'L'),
        makeListItem('2', 'item-milk', 'Fresh Milk', 2, 'L'),
      ];

      const issues = findReviewIssues(items);
      const dupIssues = issues.filter((i) => i.type === 'duplicate_item');
      expect(dupIssues.length).toBe(2);
      expect(items.length).toBe(2); // Original array not mutated
    });
  });

  describe('Category Grouping (groupListItemsByCategory)', () => {
    it('groups items into categories according to standard category sort order', () => {
      const items = [
        makeListItem('1', 'item-toothpaste', 'Toothpaste', 1, 'pack'), // cat-personal (order 2)
        makeListItem('2', 'item-atta', 'Atta', 10, 'kg'), // cat-kitchen (order 1)
      ];

      const groups = groupListItemsByCategory(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      expect(groups.length).toBe(2);
      expect(groups[0].categoryId).toBe('cat-kitchen');
      expect(groups[1].categoryId).toBe('cat-personal');
    });

    it('places custom or uncategorized items into Other at the end', () => {
      const items = [
        makeListItem('1', null, 'Birthday Candles', 1, 'pack'),
        makeListItem('2', 'item-atta', 'Atta', 10, 'kg'),
      ];

      const groups = groupListItemsByCategory(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      expect(groups.length).toBe(2);
      expect(groups[0].categoryId).toBe('cat-kitchen');
      expect(groups[1].categoryName).toBe('Other');
      expect(groups[1].items[0].itemNameSnapshot).toBe('Birthday Candles');
    });

    it('preserves user list order within each category group', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg'),
        makeListItem('2', 'item-rice-basmati', 'Basmati Rice', 5, 'kg'),
        makeListItem('3', 'item-toor-dal', 'Toor Dal', 2, 'kg'),
      ];

      const groups = groupListItemsByCategory(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      expect(groups.length).toBe(1);
      expect(groups[0].items.map((i) => i.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('Complete Review Summary (getListReviewSummary)', () => {
    it('calculates full summary correctly for active list', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', true, 450),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', false, 60),
        makeListItem('3', null, 'Special Item', 1, 'pack', false, 100),
      ];

      const summary = getListReviewSummary(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      expect(summary.totalItems).toBe(3);
      expect(summary.purchasedCount).toBe(1);
      expect(summary.remainingCount).toBe(2);
      expect(summary.completionPercentage).toBe(33);
      // Budget: (450*10) + (60*2) + (100*1) = 4500 + 120 + 100 = 4720
      expect(summary.estimatedBudget).toBe(4720);
      expect(summary.categoryCount).toBeGreaterThanOrEqual(2);
    });

    it('returns empty summary for empty array', () => {
      const summary = getListReviewSummary([]);
      expect(summary.totalItems).toBe(0);
      expect(summary.categoryGroups).toEqual([]);
      expect(summary.issues).toEqual([]);
    });
  });

  describe('Shopping Sort (sortListItemsForShopping)', () => {
    it('places unpurchased items first within each category group', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', true),
        makeListItem('2', 'item-rice-basmati', 'Rice', 5, 'kg', false),
      ];

      const sorted = sortListItemsForShopping(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      expect(sorted[0].id).toBe('2'); // Unpurchased first
      expect(sorted[1].id).toBe('1'); // Purchased last
    });

    it('produces deterministic output across multiple runs', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', true),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', false),
      ];

      const run1 = sortListItemsForShopping(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS).map((i) => i.id);
      const run2 = sortListItemsForShopping(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS).map((i) => i.id);

      expect(run1).toEqual(run2);
    });
  });
});
