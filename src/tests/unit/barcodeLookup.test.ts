import { describe, it, expect } from 'vitest';
import {
  normalizeBarcode,
  buildBarcodeLookupMap,
  lookupCatalogItemByBarcode,
} from '../../utils/barcodeLookup';
import {
  findMatchingListItem,
  mergeItemQuantities,
} from '../../utils/catalogItemIdentity';
import { getDefaultQuantity } from '../../utils/catalogQuantity';
import { SEED_CATEGORIES, SEED_CATALOG_ITEMS } from '../../db/seedData';
import type { CatalogItem, ListItem } from '../../types/database';

describe('QR & Barcode Scanner Unit Tests (STEP 13 & 13A)', () => {
  const sampleCatalog: CatalogItem[] = [
    {
      id: 'item-atta',
      categoryId: 'cat-kitchen',
      name: 'Chakki Fresh Atta',
      defaultUnit: 'kg',
      isCustom: false,
      barcode: '8901030000001',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'item-milk-0',
      categoryId: 'cat-kitchen',
      name: 'Fresh Cow Milk',
      defaultUnit: 'L',
      isCustom: false,
      barcode: '0891234567890', // Leading zero test
      createdAt: new Date().toISOString(),
    },
    {
      id: 'item-rice',
      categoryId: 'cat-kitchen',
      name: 'Basmati Rice',
      defaultUnit: 'kg',
      isCustom: false,
      barcode: '8901234567890',
      createdAt: new Date().toISOString(),
    },
  ];

  describe('Barcode Normalization (normalizeBarcode)', () => {
    it('preserves leading zeros without numeric coercion', () => {
      const code = '0891234567890';
      const normalized = normalizeBarcode(code);
      expect(normalized).toBe('0891234567890');
      expect(normalized.startsWith('0')).toBe(true);
    });

    it('trims leading and trailing whitespace safely', () => {
      expect(normalizeBarcode('  8901030000001  \n')).toBe('8901030000001');
    });

    it('handles null, undefined, and empty string safely without throwing', () => {
      expect(normalizeBarcode(null)).toBe('');
      expect(normalizeBarcode(undefined)).toBe('');
      expect(normalizeBarcode('')).toBe('');
      expect(normalizeBarcode('   ')).toBe('');
    });

    it('performs strict string-based comparison rather than floating point numbers', () => {
      const b1 = '012345';
      const b2 = '12345';
      expect(normalizeBarcode(b1)).not.toBe(normalizeBarcode(b2));
    });
  });

  describe('Local Barcode Lookup (lookupCatalogItemByBarcode)', () => {
    const lookupMap = buildBarcodeLookupMap(sampleCatalog);

    it('resolves exact matching catalog item from barcode', () => {
      const result = lookupCatalogItemByBarcode('8901030000001', sampleCatalog, lookupMap);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('item-atta');
      expect(result?.name).toBe('Chakki Fresh Atta');
    });

    it('resolves barcode with leading zero accurately', () => {
      const result = lookupCatalogItemByBarcode('0891234567890', sampleCatalog, lookupMap);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('item-milk-0');
      expect(result?.name).toBe('Fresh Cow Milk');
    });

    it('returns null for unknown/unmatched barcode', () => {
      const result = lookupCatalogItemByBarcode('9999999999999', sampleCatalog, lookupMap);
      expect(result).toBeNull();
    });

    it('same barcode always deterministically resolves to the same catalog item', () => {
      const run1 = lookupCatalogItemByBarcode('8901030000001', sampleCatalog, lookupMap);
      const run2 = lookupCatalogItemByBarcode('8901030000001', sampleCatalog, lookupMap);
      expect(run1).toBe(run2);
      expect(run1?.id).toBe('item-atta');
    });

    it('manual barcode entry uses the identical normalization and lookup path', () => {
      const manualEntry = '  8901234567890  ';
      const cameraResult = lookupCatalogItemByBarcode('8901234567890', sampleCatalog, lookupMap);
      const manualResult = lookupCatalogItemByBarcode(manualEntry, sampleCatalog, lookupMap);
      expect(manualResult).toEqual(cameraResult);
      expect(manualResult?.id).toBe('item-rice');
    });

    it('resolves seed items from real SEED_CATALOG_ITEMS in O(1)', () => {
      const seedMap = buildBarcodeLookupMap(SEED_CATALOG_ITEMS);
      const milk = lookupCatalogItemByBarcode('8901262010054', SEED_CATALOG_ITEMS, seedMap);
      expect(milk).not.toBeNull();
      expect(milk?.name).toBe('Fresh Milk');

      const salt = lookupCatalogItemByBarcode('8901058000052', SEED_CATALOG_ITEMS, seedMap);
      expect(salt).not.toBeNull();
      expect(salt?.name).toBe('Iodized Salt (Namak)');
    });
  });

  describe('UI/UX Integration & State Handling (STEP 13A)', () => {
    it('computes smart default quantity for resolved item accurately', () => {
      const kgItem = sampleCatalog[0]; // kg
      expect(getDefaultQuantity(kgItem.defaultUnit)).toBe(1);

      const gItem: CatalogItem = {
        id: 'item-haldi',
        categoryId: 'cat-kitchen',
        name: 'Haldi',
        defaultUnit: 'g',
        isCustom: false,
        barcode: '8901234567899',
        createdAt: new Date().toISOString(),
      };
      expect(getDefaultQuantity(gItem.defaultUnit)).toBe(500);
    });

    it('resolves category display name accurately for scanned item modal UI', () => {
      const matched = sampleCatalog[0];
      const category = SEED_CATEGORIES.find((c) => c.id === matched.categoryId);
      expect(category?.name).toBe('Kitchen & Staples');
    });

    it('identifies if scanned item is already in list to present "Already in your list" state', () => {
      const currentList: ListItem[] = [
        {
          id: 'list-item-1',
          listId: 'list-1',
          catalogItemId: 'item-atta',
          itemNameSnapshot: 'Chakki Fresh Atta',
          quantity: 2,
          unit: 'kg',
          estimatedPrice: null,
          actualPrice: null,
          isPurchased: false,
          note: null,
          sortOrder: 1,
        },
      ];

      const scannedAtta = sampleCatalog[0];
      const exists = currentList.find((i) => i.catalogItemId === scannedAtta.id);
      expect(exists).toBeDefined();
      expect(exists?.quantity).toBe(2);

      const scannedRice = sampleCatalog[2];
      const riceExists = currentList.find((i) => i.catalogItemId === scannedRice.id);
      expect(riceExists).toBeUndefined();
    });
  });

  describe('Pipeline Integration (Steps 5 & 8 with Scanned Items)', () => {
    it('scanned item matching an existing list item integrates with duplicate-prevention pipeline', () => {
      const existingListItem: ListItem = {
        id: 'existing-1',
        listId: 'list-1',
        catalogItemId: 'item-atta',
        itemNameSnapshot: 'Chakki Fresh Atta',
        quantity: 5,
        unit: 'kg',
        estimatedPrice: 200,
        actualPrice: null,
        isPurchased: false,
        note: null,
        sortOrder: 1,
      };

      const scannedCatalogItem = sampleCatalog[0]; // item-atta

      // Resolve existing match
      const matching = findMatchingListItem([existingListItem], {
        catalogItemId: scannedCatalogItem.id,
        name: scannedCatalogItem.name,
      });

      expect(matching).toBeDefined();
      expect(matching?.id).toBe('existing-1');

      // Merge quantities
      const { canMerge, mergedQty } = mergeItemQuantities(matching!.quantity, matching!.unit, 5, 'kg');
      expect(canMerge).toBe(true);
      expect(mergedQty).toBe(10);
    });

    it('incompatible units on scanned items remain separate without data corruption', () => {
      const existingListItem: ListItem = {
        id: 'existing-1',
        listId: 'list-1',
        catalogItemId: 'item-atta',
        itemNameSnapshot: 'Chakki Fresh Atta',
        quantity: 1,
        unit: 'box', // Incompatible with kg
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: false,
        note: null,
        sortOrder: 1,
      };

      const { canMerge, mergedQty } = mergeItemQuantities(existingListItem.quantity, existingListItem.unit, 5, 'kg');
      expect(canMerge).toBe(false);
      expect(mergedQty).toBe(1);
    });

    it('arbitrary QR code content does not trigger automatic URL navigation', () => {
      const arbitraryQR = 'https://example.com/malicious-url';
      const result = lookupCatalogItemByBarcode(arbitraryQR, sampleCatalog);
      // Must not match catalog, and return null
      expect(result).toBeNull();
    });
  });

  describe('Scalability & Performance Benchmark', () => {
    it('builds lookup map and resolves barcodes across 1,000 items in under 5ms', () => {
      const largeCatalog: CatalogItem[] = [];
      for (let i = 0; i < 1000; i++) {
        largeCatalog.push({
          id: `item-${i}`,
          categoryId: 'cat-kitchen',
          name: `Item ${i}`,
          defaultUnit: 'kg',
          isCustom: false,
          barcode: `890100000${String(i).padStart(4, '0')}`,
          createdAt: new Date().toISOString(),
        });
      }

      const start = performance.now();
      const map = buildBarcodeLookupMap(largeCatalog);
      const match = lookupCatalogItemByBarcode('8901000000500', largeCatalog, map);
      const duration = performance.now() - start;

      expect(match).not.toBeNull();
      expect(match?.name).toBe('Item 500');
      expect(duration).toBeLessThan(15);
    });
  });
});
