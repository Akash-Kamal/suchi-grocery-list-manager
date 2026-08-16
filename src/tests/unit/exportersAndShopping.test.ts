import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { formatWhatsAppMessage } from '../../utils/whatsappExporter';
import { generateGroceryPDF } from '../../utils/pdfExporter';
import { SuchiDatabase } from '../../db/schema';
import { ListRepository } from '../../repositories/listRepository';
import { HistoryRepository } from '../../repositories/historyRepository';
import { calculateFrequencyScore, calculateMedianQuantity } from '../../services/suggestionEngine';
import type { Category, GroceryList, ListItem, RecurringItemStat } from '../../types/database';

describe('Phase 3 — Exporters & Shopping Session Unit Tests', () => {
  let testDb: SuchiDatabase;
  let listRepo: ListRepository;
  let historyRepo: HistoryRepository;

  const mockCategories: Category[] = [
    { id: 'cat-kitchen', name: 'Kitchen & Staples', sortOrder: 1, icon: 'Utensils' },
    { id: 'cat-beverages', name: 'Beverages', sortOrder: 2, icon: 'Coffee' },
  ];

  const mockList: GroceryList = {
    id: 'list-123',
    title: 'August Grocery List',
    listMonth: '2026-08',
    status: 'finalized',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };

  const mockItems: ListItem[] = [
    {
      id: 'item-1',
      listId: 'list-123',
      catalogItemId: 'item-atta',
      itemNameSnapshot: 'Chakki Fresh Atta',
      quantity: 10,
      unit: 'kg',
      estimatedPrice: 450,
      actualPrice: null,
      isPurchased: true,
      note: 'Aashirvaad Brand',
      sortOrder: 1,
    },
    {
      id: 'item-2',
      listId: 'list-123',
      catalogItemId: 'item-tea',
      itemNameSnapshot: 'Tea Leaves',
      quantity: 500,
      unit: 'g',
      estimatedPrice: 200,
      actualPrice: null,
      isPurchased: false,
      note: null,
      sortOrder: 2,
    },
  ];

  beforeEach(async () => {
    const dbName = `test-db-p3-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    testDb = new SuchiDatabase(dbName);
    await testDb.open();
    await testDb.seedIfEmpty();
    listRepo = new ListRepository(testDb);
    historyRepo = new HistoryRepository(testDb);
  });

  describe('WhatsApp Plain-Text Exporter', () => {
    it('formats plain text with title, categories, items, and notes correctly', () => {
      const formatted = formatWhatsAppMessage(mockList, mockItems, mockCategories);

      expect(formatted).toContain('🛒 *August Grocery List*');
      expect(formatted).toContain('Chakki Fresh Atta — 10 kg');
      expect(formatted).toContain('_(Aashirvaad Brand)_');
      expect(formatted).toContain('✅'); // Marked purchased
      expect(formatted).toContain('☐'); // Unpurchased
    });
  });

  describe('PDF Exporter via pdf-lib', () => {
    it('generates PDF Uint8Array bytes for A4 and A5 sizes', async () => {
      const pdfBytesA4 = await generateGroceryPDF(mockList, mockItems, mockCategories, 'A4');
      expect(pdfBytesA4).toBeInstanceOf(Uint8Array);
      expect(pdfBytesA4.length).toBeGreaterThan(1000);

      const pdfBytesA5 = await generateGroceryPDF(mockList, mockItems, mockCategories, 'A5');
      expect(pdfBytesA5).toBeInstanceOf(Uint8Array);
      expect(pdfBytesA5.length).toBeGreaterThan(1000);
    });
  });

  describe('Shopping Session Completion & Recurring Stats Recalculation', () => {
    it('recalculates frequency scores and median quantities on completed session', async () => {
      // 1. Create and finalize 2 lists
      const { list: list1 } = await listRepo.createDraftList('List 1', '2026-06');
      await listRepo.addItemToList(list1.id, {
        catalogItemId: 'item-atta',
        itemNameSnapshot: 'Atta',
        quantity: 10,
        unit: 'kg',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: true,
        note: null,
      });
      await listRepo.updateListStatus(list1.id, 'completed');

      const { list: list2 } = await listRepo.createDraftList('List 2', '2026-07');
      await listRepo.addItemToList(list2.id, {
        catalogItemId: 'item-atta',
        itemNameSnapshot: 'Atta',
        quantity: 12,
        unit: 'kg',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: true,
        note: null,
      });
      await listRepo.updateListStatus(list2.id, 'completed');

      // 2. Fetch history and update stats
      const pastLists = await historyRepo.getPastLists(100);
      expect(pastLists.length).toBe(2);

      const historyMap = await historyRepo.getAllItemHistories();
      const records = historyMap.get('item-atta') || [];
      expect(records.length).toBe(2);

      const freqScore = calculateFrequencyScore(records.length, pastLists.length);
      expect(freqScore).toBe(1.0); // Bought in 100% of lists

      const medianQty = calculateMedianQuantity(records.map((r) => r.item.quantity));
      expect(medianQty).toBe(11); // Median of 10 and 12 is 11

      const statRecord: RecurringItemStat = {
        id: 'stat-item-atta',
        catalogItemId: 'item-atta',
        frequencyScore: freqScore,
        medianQuantity: medianQty,
        medianUnit: 'kg',
        lastPurchasedAt: new Date().toISOString(),
        typicalIntervalDays: 30,
      };

      await historyRepo.updateRecurringStats([statRecord]);

      const savedStat = await historyRepo.getRecurringStatByCatalogItemId('item-atta');
      expect(savedStat).toBeDefined();
      expect(savedStat?.frequencyScore).toBe(1.0);
      expect(savedStat?.medianQuantity).toBe(11);
    });
  });
});
