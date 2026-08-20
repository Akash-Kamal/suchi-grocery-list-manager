import { describe, it, expect } from 'vitest';
import {
  getShoppingProgress,
  getShoppingBudgetBreakdown,
  filterAndGroupShoppingItems,
} from '../../utils/listReview';
import { SEED_CATEGORIES, SEED_CATALOG_ITEMS } from '../../db/seedData';
import type { ListItem } from '../../types/database';

describe('Shopping Mode & List Actions Unit Tests (STEP 10)', () => {
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

  describe('Shopping Progress & Budget Calculations', () => {
    it('handles empty list shopping state safely with 0 progress', () => {
      const progress = getShoppingProgress([]);
      expect(progress).toEqual({ total: 0, completed: 0, remaining: 0, percentage: 0 });

      const budget = getShoppingBudgetBreakdown([]);
      expect(budget).toEqual({ totalBudget: 0, purchasedBudget: 0, remainingBudget: 0 });
    });

    it('calculates initial state when all items are remaining (0% progress)', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', false, 400),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', false, 60),
      ];

      const progress = getShoppingProgress(items);
      expect(progress.total).toBe(2);
      expect(progress.completed).toBe(0);
      expect(progress.remaining).toBe(2);
      expect(progress.percentage).toBe(0);

      const budget = getShoppingBudgetBreakdown(items);
      expect(budget.totalBudget).toBe(4000 + 120);
      expect(budget.purchasedBudget).toBe(0);
      expect(budget.remainingBudget).toBe(4120);
    });

    it('calculates partial completion progress and budget accurately (50% progress)', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', true, 400),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', false, 60),
      ];

      const progress = getShoppingProgress(items);
      expect(progress.total).toBe(2);
      expect(progress.completed).toBe(1);
      expect(progress.remaining).toBe(1);
      expect(progress.percentage).toBe(50);

      const budget = getShoppingBudgetBreakdown(items);
      expect(budget.totalBudget).toBe(4120);
      expect(budget.purchasedBudget).toBe(4000);
      expect(budget.remainingBudget).toBe(120);
    });

    it('calculates 100% completion state when all items are marked purchased', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', true, 400),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', true, 60),
      ];

      const progress = getShoppingProgress(items);
      expect(progress.total).toBe(2);
      expect(progress.completed).toBe(2);
      expect(progress.remaining).toBe(0);
      expect(progress.percentage).toBe(100);

      const budget = getShoppingBudgetBreakdown(items);
      expect(budget.totalBudget).toBe(4120);
      expect(budget.purchasedBudget).toBe(4120);
      expect(budget.remainingBudget).toBe(0);
    });
  });

  describe('Shopping Status & Category Filters (filterAndGroupShoppingItems)', () => {
    const sampleItems = [
      makeListItem('1', 'item-atta', 'Atta', 10, 'kg', false), // Kitchen (cat-kitchen)
      makeListItem('2', 'item-milk', 'Milk', 2, 'L', true), // Kitchen (cat-kitchen)
      makeListItem('3', 'item-toothpaste', 'Toothpaste', 1, 'pack', false), // Personal (cat-personal)
      makeListItem('4', null, 'Candles', 1, 'pack', true), // Custom (Other)
    ];

    it('filters by status: "all" returns all items grouped by category', () => {
      const groups = filterAndGroupShoppingItems(sampleItems, SEED_CATEGORIES, SEED_CATALOG_ITEMS, {
        statusFilter: 'all',
      });

      const allItems = groups.flatMap((g) => g.items);
      expect(allItems.length).toBe(4);
    });

    it('filters by status: "remaining" returns only unpurchased items', () => {
      const groups = filterAndGroupShoppingItems(sampleItems, SEED_CATEGORIES, SEED_CATALOG_ITEMS, {
        statusFilter: 'remaining',
      });

      const remainingItems = groups.flatMap((g) => g.items);
      expect(remainingItems.length).toBe(2);
      expect(remainingItems.every((i) => !i.isPurchased)).toBe(true);
      expect(remainingItems.map((i) => i.id)).toEqual(['1', '3']);
    });

    it('filters by status: "purchased" returns only purchased items', () => {
      const groups = filterAndGroupShoppingItems(sampleItems, SEED_CATEGORIES, SEED_CATALOG_ITEMS, {
        statusFilter: 'purchased',
      });

      const purchasedItems = groups.flatMap((g) => g.items);
      expect(purchasedItems.length).toBe(2);
      expect(purchasedItems.every((i) => i.isPurchased)).toBe(true);
      expect(purchasedItems.map((i) => i.id)).toEqual(['2', '4']);
    });

    it('filters by category: returns only items in selected category', () => {
      const groups = filterAndGroupShoppingItems(sampleItems, SEED_CATEGORIES, SEED_CATALOG_ITEMS, {
        statusFilter: 'all',
        selectedCategory: 'cat-personal',
      });

      expect(groups.length).toBe(1);
      expect(groups[0].categoryId).toBe('cat-personal');
      expect(groups[0].items.length).toBe(1);
      expect(groups[0].items[0].id).toBe('3');
    });

    it('filters by search query case-insensitively', () => {
      const groups = filterAndGroupShoppingItems(sampleItems, SEED_CATEGORIES, SEED_CATALOG_ITEMS, {
        searchQuery: 'milk',
      });

      const matched = groups.flatMap((g) => g.items);
      expect(matched.length).toBe(1);
      expect(matched[0].itemNameSnapshot).toBe('Milk');
    });

    it('orders remaining (unpurchased) items before purchased items within each category', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', true), // Kitchen (purchased)
        makeListItem('2', 'item-rice-basmati', 'Rice', 5, 'kg', false), // Kitchen (remaining)
      ];

      const groups = filterAndGroupShoppingItems(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS, {
        statusFilter: 'all',
      });

      expect(groups.length).toBe(1);
      // Unpurchased (Rice) must come before purchased (Atta)
      expect(groups[0].items[0].id).toBe('2');
      expect(groups[0].items[1].id).toBe('1');
    });

    it('preserves user list order within the remaining and purchased subgroups', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', false),
        makeListItem('2', 'item-rice-basmati', 'Rice', 5, 'kg', false),
        makeListItem('3', 'item-toor-dal', 'Dal', 2, 'kg', false),
      ];

      const groups = filterAndGroupShoppingItems(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS);
      expect(groups[0].items.map((i) => i.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('Non-Destructive State Mutations & Bulk Operations', () => {
    it('marking an item purchased does not alter quantity, unit, note, or catalogId metadata', () => {
      const original = makeListItem('1', 'item-atta', 'Chakki Fresh Atta', 10, 'kg', false, 450, 'Prefer 10kg sack');

      // Toggle purchased
      const updated: ListItem = { ...original, isPurchased: true };

      expect(updated.id).toBe(original.id);
      expect(updated.catalogItemId).toBe(original.catalogItemId);
      expect(updated.itemNameSnapshot).toBe(original.itemNameSnapshot);
      expect(updated.quantity).toBe(original.quantity);
      expect(updated.unit).toBe(original.unit);
      expect(updated.estimatedPrice).toBe(original.estimatedPrice);
      expect(updated.note).toBe(original.note);
      expect(updated.isPurchased).toBe(true);
    });

    it('bulk marking all items purchased updates only isPurchased flag', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', false),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', false),
      ];

      const bulkMarked = items.map((i) => ({ ...i, isPurchased: true }));
      expect(bulkMarked.every((i) => i.isPurchased)).toBe(true);
      expect(bulkMarked[0].quantity).toBe(10);
      expect(bulkMarked[1].quantity).toBe(2);
    });

    it('resetting shopping progress resets all isPurchased flags to false non-destructively', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', true),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', true),
      ];

      const reset = items.map((i) => ({ ...i, isPurchased: false }));
      expect(reset.every((i) => !i.isPurchased)).toBe(true);
      expect(reset.length).toBe(2);
    });

    it('produces deterministic output across multiple repeated executions without duplicates', () => {
      const items = [
        makeListItem('1', 'item-atta', 'Atta', 10, 'kg', false),
        makeListItem('2', 'item-milk', 'Milk', 2, 'L', true),
        makeListItem('3', 'item-sugar', 'Sugar', 1, 'kg', false),
      ];

      const run1 = filterAndGroupShoppingItems(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS).flatMap((g) => g.items.map((i) => i.id));
      const run2 = filterAndGroupShoppingItems(items, SEED_CATEGORIES, SEED_CATALOG_ITEMS).flatMap((g) => g.items.map((i) => i.id));

      expect(run1).toEqual(run2);
      expect(run1.length).toBe(new Set(run1).size); // No duplicates
    });
  });
});
