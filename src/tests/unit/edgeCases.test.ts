import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { SuchiDatabase } from '../../db/schema';
import { ListRepository } from '../../repositories/listRepository';
import { CatalogRepository } from '../../repositories/catalogRepository';

describe('Edge Case Resilience Unit Tests', () => {
  let testDb: SuchiDatabase;
  let listRepo: ListRepository;
  let catalogRepo: CatalogRepository;

  beforeEach(async () => {
    const dbName = `test-db-edge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    testDb = new SuchiDatabase(dbName);
    await testDb.open();
    await testDb.seedIfEmpty();
    listRepo = new ListRepository(testDb);
    catalogRepo = new CatalogRepository(testDb);
  });

  it('Snapshot fields preserve item name & unit if catalog item is deleted', async () => {
    // 1. Create custom catalog item
    const custom = await catalogRepo.addCustomCatalogItem({
      categoryId: 'cat-kitchen',
      name: 'Organic Gud / Jaggery',
      defaultUnit: 'kg',
    });

    // 2. Add to draft list
    const { list } = await listRepo.createDraftList();
    await listRepo.addItemToList(list.id, {
      catalogItemId: custom.id,
      itemNameSnapshot: custom.name,
      quantity: 2,
      unit: custom.defaultUnit,
      estimatedPrice: 120,
      actualPrice: null,
      isPurchased: false,
      note: 'Local farm gud',
    });

    // 3. Delete the original catalog item from Dexie
    await testDb.catalogItems.delete(custom.id);
    const deletedCheck = await catalogRepo.getCatalogItemById(custom.id);
    expect(deletedCheck).toBeUndefined();

    // 4. Retrieve list item and verify snapshot fields remain intact
    const fetchedList = await listRepo.getListWithItems(list.id);
    expect(fetchedList?.items.length).toBe(1);
    expect(fetchedList?.items[0].itemNameSnapshot).toBe('Organic Gud / Jaggery');
    expect(fetchedList?.items[0].unit).toBe('kg');
  });

  it('Continuous draft auto-save persists changes across database re-opens', async () => {
    const dbName = `test-db-reopen-${Date.now()}`;
    const db1 = new SuchiDatabase(dbName);
    await db1.open();
    await db1.seedIfEmpty();
    const listRepo1 = new ListRepository(db1);

    const { list } = await listRepo1.createDraftList();
    await listRepo1.addItemToList(list.id, {
      catalogItemId: 'item-atta',
      itemNameSnapshot: 'Chakki Fresh Atta',
      quantity: 15,
      unit: 'kg',
      estimatedPrice: 600,
      actualPrice: null,
      isPurchased: false,
      note: 'Auto-save test',
    });

    db1.close();

    // Re-open fresh connection (simulating browser restart)
    const db2 = new SuchiDatabase(dbName);
    await db2.open();
    const listRepo2 = new ListRepository(db2);
    const draft = await listRepo2.getCurrentDraft();

    expect(draft).not.toBeNull();
    expect(draft?.items.length).toBe(1);
    expect(draft?.items[0].quantity).toBe(15);
    expect(draft?.items[0].note).toBe('Auto-save test');
  });
});
