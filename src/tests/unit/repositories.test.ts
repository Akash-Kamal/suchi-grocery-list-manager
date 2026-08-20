import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { SuchiDatabase } from '../../db/schema';
import { CatalogRepository } from '../../repositories/catalogRepository';
import { ListRepository } from '../../repositories/listRepository';
import { HistoryRepository } from '../../repositories/historyRepository';
import { PreferenceRepository } from '../../repositories/preferenceRepository';
import { ShoppingSessionRepository } from '../../repositories/shoppingSessionRepository';
import { isDraftStale } from '../../repositories/listRepository';

describe('Repository Layer Unit Tests', () => {
  let testDb: SuchiDatabase;
  let catalogRepo: CatalogRepository;
  let listRepo: ListRepository;
  let historyRepo: HistoryRepository;
  let prefRepo: PreferenceRepository;
  let sessionRepo: ShoppingSessionRepository;

  beforeEach(async () => {
    // Create unique in-memory Dexie DB for each test run
    const dbName = `test-db-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    testDb = new SuchiDatabase(dbName);
    await testDb.open();
    await testDb.seedIfEmpty();

    catalogRepo = new CatalogRepository(testDb);
    listRepo = new ListRepository(testDb);
    historyRepo = new HistoryRepository(testDb);
    prefRepo = new PreferenceRepository(testDb);
    sessionRepo = new ShoppingSessionRepository(testDb);
  });

  describe('Database Seeding & CatalogRepository', () => {
    it('seeds categories and catalog items on startup', async () => {
      const categories = await catalogRepo.getCategories();
      expect(categories.length).toBe(8);
      expect(categories[0].name).toBe('Kitchen & Staples');

      const items = await catalogRepo.getCatalogItems();
      expect(items.length).toBeGreaterThanOrEqual(35);
    });

    it('searches catalog items by direct name and alias', async () => {
      const directMatches = await catalogRepo.searchCatalog('atta');
      expect(directMatches.some((item) => item.name.includes('Atta'))).toBe(true);

      // Search by Hindi alias "Pyaz" for Onions
      const aliasMatches = await catalogRepo.searchCatalog('Pyaz');
      expect(aliasMatches.some((item) => item.name.includes('Onions'))).toBe(true);
    });

    it('loads all item aliases via getItemAliases and supports in-memory alias mapping', async () => {
      const aliases = await catalogRepo.getItemAliases();
      expect(aliases.length).toBeGreaterThanOrEqual(15);

      const aliasMap = new Map<string, string[]>();
      for (const a of aliases) {
        const list = aliasMap.get(a.catalogItemId);
        if (list) list.push(a.aliasText.toLowerCase());
        else aliasMap.set(a.catalogItemId, [a.aliasText.toLowerCase()]);
      }

      const allItems = await catalogRepo.getCatalogItems();
      const search = (q: string) => {
        const query = q.trim().toLowerCase();
        return allItems.filter((item) => {
          if (item.name.toLowerCase().includes(query)) return true;
          const itemAliases = aliasMap.get(item.id);
          return itemAliases && itemAliases.some((al) => al.includes(query));
        });
      };

      // Test cases
      expect(search('doodh').some((i) => i.name.includes('Milk'))).toBe(true);
      expect(search('दूध').some((i) => i.name.includes('Milk'))).toBe(true);
      expect(search('pyaaz').some((i) => i.name.includes('Onion'))).toBe(true);
      expect(search('प्याज').some((i) => i.name.includes('Onion'))).toBe(true);
      expect(search('chawal').some((i) => i.name.includes('Rice'))).toBe(true);
      expect(search('चावल').some((i) => i.name.includes('Rice'))).toBe(true);
      expect(search('aloo').some((i) => i.name.includes('Potatoes'))).toBe(true);
      expect(search('आलू').some((i) => i.name.includes('Potatoes'))).toBe(true);
    });

    it('adds custom catalog items correctly', async () => {
      const customItem = await catalogRepo.addCustomCatalogItem({
        categoryId: 'cat-kitchen',
        name: 'Jaggery (Gud)',
        defaultUnit: 'kg',
      });

      expect(customItem.isCustom).toBe(true);
      expect(customItem.id).toContain('custom-item-');

      const fetched = await catalogRepo.getCatalogItemById(customItem.id);
      expect(fetched).toBeDefined();
      expect(fetched?.name).toBe('Jaggery (Gud)');
    });

    it('toggles favorite status for catalog items', async () => {
      const items = await catalogRepo.getCatalogItems();
      const testItem = items[0];

      let isFav = await catalogRepo.isFavorite(testItem.id);
      expect(isFav).toBe(false);

      const added = await catalogRepo.toggleFavorite(testItem.id);
      expect(added).toBe(true);

      isFav = await catalogRepo.isFavorite(testItem.id);
      expect(isFav).toBe(true);

      const favorites = await catalogRepo.getFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].catalogItemId).toBe(testItem.id);

      const removed = await catalogRepo.toggleFavorite(testItem.id);
      expect(removed).toBe(false);
    });
  });

  describe('ListRepository', () => {
    it('creates and retrieves draft grocery list', async () => {
      const { list, items } = await listRepo.createDraftList('My Monthly Grocery');
      expect(list.status).toBe('draft');
      expect(list.title).toBe('My Monthly Grocery');
      expect(items.length).toBe(0);

      const activeDraft = await listRepo.getCurrentDraft();
      expect(activeDraft).not.toBeNull();
      expect(activeDraft?.list.id).toBe(list.id);
    });

    it('adds items with snapshots to draft list', async () => {
      const { list } = await listRepo.createDraftList();
      
      const newItem = await listRepo.addItemToList(list.id, {
        catalogItemId: 'item-atta',
        itemNameSnapshot: 'Chakki Fresh Atta',
        quantity: 10,
        unit: 'kg',
        estimatedPrice: 450,
        actualPrice: null,
        isPurchased: false,
        note: 'Prefer Aashirvaad Brand',
      });

      expect(newItem.listId).toBe(list.id);
      expect(newItem.itemNameSnapshot).toBe('Chakki Fresh Atta');
      expect(newItem.quantity).toBe(10);

      const draft = await listRepo.getCurrentDraft();
      expect(draft?.items.length).toBe(1);
      expect(draft?.items[0].itemNameSnapshot).toBe('Chakki Fresh Atta');
    });

    it('updates and removes items from draft list', async () => {
      const { list } = await listRepo.createDraftList();
      const item = await listRepo.addItemToList(list.id, {
        catalogItemId: 'item-milk',
        itemNameSnapshot: 'Fresh Milk',
        quantity: 2,
        unit: 'L',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: false,
        note: null,
      });

      await listRepo.updateListItem(item.id, { quantity: 5, isPurchased: true });
      let updatedList = await listRepo.getListWithItems(list.id);
      expect(updatedList?.items[0].quantity).toBe(5);
      expect(updatedList?.items[0].isPurchased).toBe(true);

      await listRepo.removeListItem(item.id);
      updatedList = await listRepo.getListWithItems(list.id);
      expect(updatedList?.items.length).toBe(0);
    });

    // --- Phase 4 regression tests for the two hand-patched bugs ---

    it('[Regression] forceNew=true never leaves more than 1 draft even with active draft that has items', async () => {
      // Create an existing draft and add items to it
      const firstDraft = await listRepo.createDraftList('First Draft');
      await listRepo.addItemToList(firstDraft.list.id, {
        catalogItemId: 'item-atta',
        itemNameSnapshot: 'Chakki Fresh Atta',
        quantity: 10,
        unit: 'kg',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: false,
        note: null,
      });

      // Sanity: only 1 draft now
      const allDraftsBefore = await testDb.groceryLists.where('status').equals('draft').toArray();
      expect(allDraftsBefore.length).toBe(1);

      // Call createDraftList with forceNew=true — should finalize existing and create new
      const secondDraft = await listRepo.createDraftList('Second Draft (Smart Repeat)', undefined, true);

      // Only 1 draft must exist after
      const allDraftsAfter = await testDb.groceryLists.where('status').equals('draft').toArray();
      expect(allDraftsAfter.length).toBe(1);
      expect(allDraftsAfter[0].id).toBe(secondDraft.list.id);

      // The first draft must now be finalized (not deleted)
      const firstDraftRefetched = await testDb.groceryLists.get(firstDraft.list.id);
      expect(firstDraftRefetched).toBeDefined();
      expect(firstDraftRefetched?.status).toBe('finalized');
    });

    it('[Regression] isDraftStale returns true for previous month, false for current month', () => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Build a previous month string
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const staleDraft = {
        id: 'stale-id',
        title: 'Stale',
        listMonth: prevMonth,
        status: 'draft' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const freshDraft = {
        id: 'fresh-id',
        title: 'Fresh',
        listMonth: currentMonth,
        status: 'draft' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(isDraftStale(staleDraft)).toBe(true);
      expect(isDraftStale(freshDraft)).toBe(false);
    });
  });

  describe('HistoryRepository & PreferenceRepository', () => {
    it('tracks past finalized lists and item history', async () => {
      const { list } = await listRepo.createDraftList();
      await listRepo.addItemToList(list.id, {
        catalogItemId: 'item-rice-basmati',
        itemNameSnapshot: 'Basmati Rice',
        quantity: 5,
        unit: 'kg',
        estimatedPrice: 600,
        actualPrice: 580,
        isPurchased: true,
        note: null,
      });

      await listRepo.updateListStatus(list.id, 'finalized');

      const pastLists = await historyRepo.getPastLists();
      expect(pastLists.length).toBe(1);
      expect(pastLists[0].id).toBe(list.id);

      const itemHistory = await historyRepo.getItemHistory('item-rice-basmati');
      expect(itemHistory.length).toBe(1);
      expect(itemHistory[0].quantity).toBe(5);
    });

    it('manages user preferences correctly', async () => {
      const initial = await prefRepo.getPreferences();
      expect(initial.theme).toBe('system');

      const updated = await prefRepo.updatePreferences({ theme: 'dark', budgetCeiling: 5000 });
      expect(updated.theme).toBe('dark');
      expect(updated.budgetCeiling).toBe(5000);
    });
  });

  describe('ShoppingSessionRepository', () => {
    it('opens a session and returns same session if already open', async () => {
      const { list } = await listRepo.createDraftList();

      const session1 = await sessionRepo.openSession(list.id);
      expect(session1.listId).toBe(list.id);
      expect(session1.completedAt).toBeNull();

      // Calling openSession again should return the SAME session (idempotent)
      const session2 = await sessionRepo.openSession(list.id);
      expect(session2.id).toBe(session1.id);

      const allSessions = await testDb.shoppingSessions.toArray();
      expect(allSessions.length).toBe(1);
    });

    it('records shopping events with correct types', async () => {
      const { list } = await listRepo.createDraftList();
      const item = await listRepo.addItemToList(list.id, {
        catalogItemId: 'item-milk',
        itemNameSnapshot: 'Fresh Milk',
        quantity: 2,
        unit: 'L',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: false,
        note: null,
      });

      const session = await sessionRepo.openSession(list.id);

      const event1 = await sessionRepo.recordEvent(session.id, item.id, 'marked_bought');
      expect(event1.eventType).toBe('marked_bought');
      expect(event1.listItemId).toBe(item.id);
      expect(event1.sessionId).toBe(session.id);

      const event2 = await sessionRepo.recordEvent(session.id, item.id, 'unmarked');
      expect(event2.eventType).toBe('unmarked');

      const events = await sessionRepo.getSessionEvents(session.id);
      expect(events.length).toBe(2);
    });

    it('completes a session and marks completedAt', async () => {
      const { list } = await listRepo.createDraftList();
      const session = await sessionRepo.openSession(list.id);
      expect(session.completedAt).toBeNull();

      await sessionRepo.completeSession(session.id);

      const completedSessions = await sessionRepo.getCompletedSessions(list.id);
      expect(completedSessions.length).toBe(1);
      expect(completedSessions[0].completedAt).not.toBeNull();
    });

    it('[Regression] abandoned session does NOT contribute to recurring item stats', async () => {
      // Create a finalized list with items (this is old data, before session tracking)
      const { list: oldList } = await listRepo.createDraftList('Old List', '2026-01');
      await listRepo.addItemToList(oldList.id, {
        catalogItemId: 'item-rice-basmati',
        itemNameSnapshot: 'Basmati Rice',
        quantity: 5,
        unit: 'kg',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: true,
        note: null,
      });
      await listRepo.updateListStatus(oldList.id, 'finalized');

      // Create a second list with an ABANDONED session (completedAt = null)
      const { list: abandonedList } = await listRepo.createDraftList('Abandoned', '2026-02', true);
      await listRepo.addItemToList(abandonedList.id, {
        catalogItemId: 'item-rice-basmati',
        itemNameSnapshot: 'Basmati Rice',
        quantity: 50, // unusual quantity that should NOT affect median
        unit: 'kg',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: false,
        note: null,
      });
      await listRepo.updateListStatus(abandonedList.id, 'finalized');

      // Open a session for the abandoned list but DON'T complete it
      await sessionRepo.openSession(abandonedList.id);

      // getAllItemHistories should exclude the abandoned list's items
      const historyMap = await historyRepo.getAllItemHistories();
      const riceHistory = historyMap.get('item-rice-basmati');

      // Only the old list's record (qty=5) should appear; qty=50 from abandoned session excluded
      expect(riceHistory).toBeDefined();
      expect(riceHistory!.length).toBe(1);
      expect(riceHistory![0].item.quantity).toBe(5);
    });
  });
});
