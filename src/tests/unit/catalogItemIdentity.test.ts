import { describe, it, expect } from 'vitest';
import {
  normalizeItemName,
  normalizeUnit,
  areUnitsCompatible,
  mergeItemQuantities,
  areItemsEquivalent,
  findMatchingListItem,
} from '../../utils/catalogItemIdentity';
import type { ListItem } from '../../types/database';

describe('Catalog Item Identity & Duplicate Prevention Unit Tests', () => {
  const makeListItem = (id: string, catalogItemId: string | null, name: string, quantity = 1, unit = 'kg'): ListItem => ({
    id,
    listId: 'list-1',
    catalogItemId,
    itemNameSnapshot: name,
    quantity,
    unit,
    estimatedPrice: null,
    actualPrice: null,
    isPurchased: false,
    note: null,
    sortOrder: 0,
  });

  describe('Name & Unit Normalization', () => {
    it('normalizes names case-insensitively and collapses repeated whitespace', () => {
      expect(normalizeItemName('Milk')).toBe('milk');
      expect(normalizeItemName('  fresh   milk  ')).toBe('fresh milk');
      expect(normalizeItemName('CHAKKI   FRESH ATTA')).toBe('chakki fresh atta');
    });

    it('safely handles empty, null, and undefined names and units', () => {
      expect(normalizeItemName('')).toBe('');
      expect(normalizeItemName(null)).toBe('');
      expect(normalizeItemName(undefined)).toBe('');
      expect(normalizeUnit('')).toBe('');
      expect(normalizeUnit(null)).toBe('');
      expect(normalizeUnit(undefined)).toBe('');
    });

    it('normalizes units case-insensitively', () => {
      expect(normalizeUnit('KG')).toBe('kg');
      expect(normalizeUnit('  Ml ')).toBe('ml');
      expect(normalizeUnit('PACK')).toBe('pack');
    });
  });

  describe('Item Equivalence (areItemsEquivalent)', () => {
    it('treats items with the same catalogItemId as equivalent even if displayed name differs slightly', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: 'item-milk', name: 'Fresh Milk' },
          { catalogItemId: 'item-milk', name: 'Milk' }
        )
      ).toBe(true);
    });

    it('treats items with different catalogItemIds as not equivalent', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: 'item-milk', name: 'Milk' },
          { catalogItemId: 'item-atta', name: 'Atta' }
        )
      ).toBe(false);
    });

    it('treats custom items with the same normalized name as equivalent', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: null, name: 'Dishwasher Pods' },
          { catalogItemId: null, name: '  dishwasher   pods ' }
        )
      ).toBe(true);
    });

    it('treats custom items with different names as not equivalent', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: null, name: 'Milk' },
          { catalogItemId: null, name: 'Milk Powder' }
        )
      ).toBe(false);
    });

    it('detects collision between catalog item and same-name custom item', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: 'item-milk', name: 'Fresh Milk' },
          { catalogItemId: null, name: 'fresh milk' }
        )
      ).toBe(true);
    });

    it('does NOT treat partial substring names as equivalent (e.g. Milk vs Milk Powder)', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: 'item-milk', name: 'Milk' },
          { catalogItemId: null, name: 'Milk Powder' }
        )
      ).toBe(false);
      expect(
        areItemsEquivalent(
          { catalogItemId: null, name: 'Milk' },
          { catalogItemId: null, name: 'Milk Powder' }
        )
      ).toBe(false);
    });

    it('resolves known Indian grocery aliases for Onions (pyaz, pyaaz, प्याज, onion)', () => {
      const onionCatalog = { catalogItemId: 'item-onions', name: 'Onions (Pyaz)' };

      expect(areItemsEquivalent(onionCatalog, { catalogItemId: null, name: 'pyaz' })).toBe(true);
      expect(areItemsEquivalent(onionCatalog, { catalogItemId: null, name: 'pyaaz' })).toBe(true);
      expect(areItemsEquivalent(onionCatalog, { catalogItemId: null, name: 'प्याज' })).toBe(true);
      expect(areItemsEquivalent(onionCatalog, { catalogItemId: null, name: 'onion' })).toBe(true);
      expect(areItemsEquivalent(onionCatalog, { catalogItemId: null, name: 'kanda' })).toBe(true);
    });

    it('does not cause unrelated aliases to collide with wrong items', () => {
      const milkCatalog = { catalogItemId: 'item-milk', name: 'Fresh Milk' };
      expect(areItemsEquivalent(milkCatalog, { catalogItemId: null, name: 'pyaz' })).toBe(false);
      expect(areItemsEquivalent(milkCatalog, { catalogItemId: null, name: 'atta' })).toBe(false);
    });

    it('safely handles custom items without catalogItemId without crashing', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: null, name: 'Custom Spice' },
          { catalogItemId: null, name: 'Custom Spice' }
        )
      ).toBe(true);
    });

    it('safely handles unknown catalog IDs without crashing', () => {
      expect(
        areItemsEquivalent(
          { catalogItemId: 'unknown-id-123', name: 'Unknown 1' },
          { catalogItemId: 'unknown-id-456', name: 'Unknown 2' }
        )
      ).toBe(false);
    });
  });

  describe('Unit Compatibility & Quantity Merging (mergeItemQuantities)', () => {
    it('detects compatible units case-insensitively', () => {
      expect(areUnitsCompatible('kg', 'kg')).toBe(true);
      expect(areUnitsCompatible('KG', 'kg')).toBe(true);
      expect(areUnitsCompatible('g', 'G')).toBe(true);
      expect(areUnitsCompatible('L', 'l')).toBe(true);
      expect(areUnitsCompatible('ml', 'ML')).toBe(true);
      expect(areUnitsCompatible('pack', 'pack')).toBe(true);
      expect(areUnitsCompatible('pcs', 'pcs')).toBe(true);
    });

    it('detects incompatible units', () => {
      expect(areUnitsCompatible('kg', 'L')).toBe(false);
      expect(areUnitsCompatible('g', 'bottle')).toBe(false);
      expect(areUnitsCompatible('pcs', 'dozen')).toBe(false);
    });

    it('merges compatible quantities safely', () => {
      expect(mergeItemQuantities(500, 'g', 100, 'g')).toEqual({ mergedQty: 600, canMerge: true });
      expect(mergeItemQuantities(1, 'kg', 2, 'KG')).toEqual({ mergedQty: 3, canMerge: true });
      expect(mergeItemQuantities(2, 'pcs', 3, 'pcs')).toEqual({ mergedQty: 5, canMerge: true });
      expect(mergeItemQuantities(500, 'ml', 500, 'ml')).toEqual({ mergedQty: 1000, canMerge: true });
    });

    it('refuses to merge incompatible units', () => {
      expect(mergeItemQuantities(1, 'kg', 1, 'L')).toEqual({ mergedQty: 1, canMerge: false });
      expect(mergeItemQuantities(500, 'g', 1, 'pack')).toEqual({ mergedQty: 500, canMerge: false });
    });

    it('safely handles invalid/NaN/negative quantities without throwing or producing NaN', () => {
      expect(mergeItemQuantities(NaN, 'g', 100, 'g')).toEqual({ mergedQty: 100, canMerge: true });
      expect(mergeItemQuantities(500, 'g', NaN, 'g')).toEqual({ mergedQty: 500, canMerge: true });
      expect(mergeItemQuantities(-10, 'g', 20, 'g')).toEqual({ mergedQty: 20, canMerge: true });
      expect(mergeItemQuantities(100, 'g', -200, 'g')).toEqual({ mergedQty: 0, canMerge: true });
    });
  });

  describe('Finding Matching List Items (findMatchingListItem)', () => {
    it('finds existing item by catalogItemId in O(1)', () => {
      const items = [
        makeListItem('1', 'item-milk', 'Fresh Milk', 1, 'L'),
        makeListItem('2', 'item-atta', 'Chakki Fresh Atta', 10, 'kg'),
      ];

      const match = findMatchingListItem(items, { catalogItemId: 'item-milk', name: 'Fresh Milk' });
      expect(match).toBeDefined();
      expect(match!.id).toBe('1');
    });

    it('finds existing item by normalized name snapshot', () => {
      const items = [
        makeListItem('1', null, 'Homemade Ghee', 1, 'kg'),
      ];

      const match = findMatchingListItem(items, { catalogItemId: null, name: '  HOMEMADE   GHEE  ' });
      expect(match).toBeDefined();
      expect(match!.id).toBe('1');
    });

    it('finds existing catalog item when custom alias is added (e.g. pyaz matches existing Onions)', () => {
      const items = [
        makeListItem('1', 'item-onions', 'Onions (Pyaz)', 1, 'kg'),
      ];

      const match = findMatchingListItem(items, { catalogItemId: null, name: 'pyaz' });
      expect(match).toBeDefined();
      expect(match!.id).toBe('1');
    });

    it('returns undefined when candidate is not in the list', () => {
      const items = [
        makeListItem('1', 'item-milk', 'Fresh Milk', 1, 'L'),
      ];

      const match = findMatchingListItem(items, { catalogItemId: 'item-atta', name: 'Atta' });
      expect(match).toBeUndefined();
    });

    it('prevents double-add / repeated clicks from creating duplicate IDs', () => {
      const items: ListItem[] = [];
      const itemToAdd = { catalogItemId: 'item-milk', name: 'Fresh Milk' };

      // First click: not in list -> creates item '1'
      let match = findMatchingListItem(items, itemToAdd);
      expect(match).toBeUndefined();
      items.push(makeListItem('item-1', 'item-milk', 'Fresh Milk', 1, 'L'));

      // Second rapid click: found in list -> updates existing item
      match = findMatchingListItem(items, itemToAdd);
      expect(match).toBeDefined();
      expect(match!.id).toBe('item-1');
      // Duplicate row is NOT created
      expect(items.length).toBe(1);
    });

    it('guarantees deterministic execution across repeated runs', () => {
      const items = [
        makeListItem('1', 'item-milk', 'Fresh Milk', 1, 'L'),
        makeListItem('2', 'item-atta', 'Chakki Fresh Atta', 10, 'kg'),
      ];

      const run1 = findMatchingListItem(items, { catalogItemId: 'item-atta', name: 'Atta' });
      const run2 = findMatchingListItem(items, { catalogItemId: 'item-atta', name: 'Atta' });

      expect(run1?.id).toBe(run2?.id);
    });
  });
});
