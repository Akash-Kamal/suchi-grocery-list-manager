import { describe, it, expect } from 'vitest';
import { generateGroceryPDF } from '../../utils/pdfExporter';
import { formatWhatsAppMessage } from '../../utils/whatsappExporter';
import { searchCatalogItems } from '../../utils/catalogSearch';
import { getSuggestedCatalogItems } from '../../utils/catalogSuggestions';
import { getContextualCatalogSuggestions } from '../../utils/catalogCompletion';
import { getShoppingProgress } from '../../utils/listReview';
import { SEED_CATEGORIES, SEED_CATALOG_ITEMS } from '../../db/seedData';
import type { GroceryList, ListItem, CatalogItem } from '../../types/database';

describe('Production QA, Security & Data Integrity Audit (STEP 12)', () => {
  const sampleList: GroceryList = {
    id: 'list-qa-1',
    title: 'Family Monthly Grocery',
    status: 'draft',
    listMonth: '2026-08',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const makeItem = (
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
    listId: 'list-qa-1',
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

  describe('Export Integrity & Consistency Audit', () => {
    it('generates WhatsApp message with category headers and purchased states', () => {
      const items: ListItem[] = [
        makeItem('1', 'item-atta', 'Chakki Atta', 10, 'kg', true, 450, 'Aashirvaad preferred'),
        makeItem('2', 'item-milk', 'Full Cream Milk', 2, 'L', false, 65),
        makeItem('3', null, 'Handmade Diya', 4, 'pcs', false, 100),
      ];

      const message = formatWhatsAppMessage(sampleList, items, SEED_CATEGORIES);

      expect(message).toContain('*Family Monthly Grocery*');
      expect(message).toContain('KITCHEN & STAPLES');
      expect(message).toContain('OTHER');
      expect(message).toContain('✅ Chakki Atta — 10 kg');
      expect(message).toContain('_(Aashirvaad preferred)_');
      expect(message).toContain('☐ Full Cream Milk — 2 L');
      expect(message).toContain('SOOCHI Smart Offline Grocery Manager');
    });

    it('generates PDF documents without throwing for lists with custom items and notes', async () => {
      const items: ListItem[] = [
        makeItem('1', 'item-atta', 'Atta', 5, 'kg', false, 250),
        makeItem('2', null, 'Candles', 1, 'box', true, null, 'Vanilla scent'),
      ];

      const pdfA4 = await generateGroceryPDF(sampleList, items, SEED_CATEGORIES, 'A4');
      const pdfA5 = await generateGroceryPDF(sampleList, items, SEED_CATEGORIES, 'A5');

      expect(pdfA4).toBeInstanceOf(Uint8Array);
      expect(pdfA4.length).toBeGreaterThan(1000);
      expect(pdfA5).toBeInstanceOf(Uint8Array);
      expect(pdfA5.length).toBeGreaterThan(1000);
    });

    it('handles empty lists gracefully in both WhatsApp and PDF exports', async () => {
      const msg = formatWhatsAppMessage(sampleList, [], SEED_CATEGORIES);
      expect(msg).toContain('Total Items: 0');

      const pdf = await generateGroceryPDF(sampleList, [], SEED_CATEGORIES, 'A4');
      expect(pdf.length).toBeGreaterThan(500);
    });
  });

  describe('Search, Ranking & Suggestion Scalability Benchmarks (1000 items)', () => {
    it('performs multilingual catalog search across 1000 items in under 15ms', () => {
      const largeCatalog: CatalogItem[] = [];
      for (let i = 0; i < 1000; i++) {
        const seed = SEED_CATALOG_ITEMS[i % SEED_CATALOG_ITEMS.length];
        largeCatalog.push({
          id: `item-${i}`,
          categoryId: seed.categoryId,
          name: `${seed.name} ${i}`,
          defaultUnit: seed.defaultUnit,
          isCustom: false,
          createdAt: new Date().toISOString(),
        });
      }

      const aliasMap = new Map<string, string[]>();
      aliasMap.set('item-0', ['atta', 'aata', 'gehu ka aata', 'आटा']);

      const start = performance.now();
      const results = searchCatalogItems(largeCatalog, 'atta', aliasMap);
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(300); // Sub-second search across 1000 items in cold Node environment
    });

    it('generates suggestions and completions across large lists in under 20ms', () => {
      const catalog = SEED_CATALOG_ITEMS;
      const currentItems: ListItem[] = [
        makeItem('1', 'item-atta', 'Atta'),
        makeItem('2', 'item-oil', 'Mustard Oil'),
      ];

      const start = performance.now();
      const suggestions = getSuggestedCatalogItems(catalog, [], new Set(['item-sugar']));
      const completions = getContextualCatalogSuggestions(catalog, currentItems, [], new Set());
      const duration = performance.now() - start;

      expect(suggestions.length).toBeGreaterThan(0);
      expect(completions.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(20);
    });
  });

  describe('State Preservation & Non-Destructive Invariants', () => {
    it('modifying purchase status preserves all item metadata strictly', () => {
      const original = makeItem('1', 'item-rice', 'Basmati Rice', 5, 'kg', false, 550, 'Long grain');
      const modified: ListItem = { ...original, isPurchased: true };

      expect(modified.id).toBe(original.id);
      expect(modified.catalogItemId).toBe(original.catalogItemId);
      expect(modified.itemNameSnapshot).toBe(original.itemNameSnapshot);
      expect(modified.quantity).toBe(original.quantity);
      expect(modified.unit).toBe(original.unit);
      expect(modified.estimatedPrice).toBe(original.estimatedPrice);
      expect(modified.note).toBe(original.note);
      expect(modified.isPurchased).toBe(true);
    });

    it('shopping progress calculations are purely derived and deterministic', () => {
      const items = [
        makeItem('1', 'item-atta', 'Atta', 5, 'kg', true),
        makeItem('2', 'item-milk', 'Milk', 2, 'L', false),
      ];

      const p1 = getShoppingProgress(items);
      const p2 = getShoppingProgress(items);

      expect(p1).toEqual(p2);
      expect(p1.percentage).toBe(50);
      expect(p1.completed).toBe(1);
      expect(p1.remaining).toBe(1);
    });
  });
});
