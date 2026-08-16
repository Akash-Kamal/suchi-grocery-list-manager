/**
 * Integration test: smart-repeat flow regression.
 *
 * Bug scenario (pre-patch):
 *   Active draft has items → user calls smart-repeat → items silently discarded without warning.
 *
 * Post-patch expectation:
 *   The original draft is only discarded AFTER the user explicitly confirms (forceNew=true).
 *   Calling createDraftList without forceNew preserves the existing draft.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { SuchiDatabase } from '../../db/schema';
import { ListRepository } from '../../repositories/listRepository';

describe('Smart-Repeat Flow Regression', () => {
  let testDb: SuchiDatabase;
  let listRepo: ListRepository;

  beforeEach(async () => {
    const dbName = `smart-repeat-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    testDb = new SuchiDatabase(dbName);
    await testDb.open();
    await testDb.seedIfEmpty();
    listRepo = new ListRepository(testDb);
  });

  it('Default createDraftList (no forceNew) preserves existing draft items intact', async () => {
    // 1. Create an active draft with items (simulates real user state before smart-repeat)
    const { list: activeDraft } = await listRepo.createDraftList('Current Month Draft');
    await listRepo.addItemToList(activeDraft.id, {
      catalogItemId: 'item-atta',
      itemNameSnapshot: 'Chakki Fresh Atta',
      quantity: 10,
      unit: 'kg',
      estimatedPrice: null,
      actualPrice: null,
      isPurchased: false,
      note: null,
    });
    await listRepo.addItemToList(activeDraft.id, {
      catalogItemId: 'item-rice-basmati',
      itemNameSnapshot: 'Basmati Rice',
      quantity: 5,
      unit: 'kg',
      estimatedPrice: null,
      actualPrice: null,
      isPurchased: false,
      note: null,
    });

    // 2. Check draft has 2 items
    const draftBefore = await listRepo.getCurrentDraft();
    expect(draftBefore).not.toBeNull();
    expect(draftBefore!.items.length).toBe(2);

    // 3. Simulate the OLD buggy behavior: call createDraftList WITHOUT forceNew
    //    This simulates what the code did before the patch.
    //    The result must be the EXISTING draft (not a new empty one).
    const returnedDraft = await listRepo.createDraftList('Smart Repeat Attempt');
    expect(returnedDraft.list.id).toBe(activeDraft.id); // Same list returned
    expect(returnedDraft.items.length).toBe(2); // Items NOT discarded

    // 4. Confirm DB still has exactly 1 draft
    const allDrafts = await testDb.groceryLists.where('status').equals('draft').toArray();
    expect(allDrafts.length).toBe(1);
  });

  it('forceNew=true finalizes existing draft and creates new one (user explicitly confirmed)', async () => {
    // 1. Active draft with items
    const { list: activeDraft } = await listRepo.createDraftList('Current Month Draft');
    const originalItem = await listRepo.addItemToList(activeDraft.id, {
      catalogItemId: 'item-atta',
      itemNameSnapshot: 'Chakki Fresh Atta',
      quantity: 10,
      unit: 'kg',
      estimatedPrice: null,
      actualPrice: null,
      isPurchased: false,
      note: null,
    });

    // 2. User CONFIRMS the warning and proceeds with smart-repeat
    const newDraft = await listRepo.createDraftList('Smart Repeat (User Confirmed)', undefined, true);

    // 3. A brand new draft should be returned (different ID)
    expect(newDraft.list.id).not.toBe(activeDraft.id);
    expect(newDraft.list.title).toBe('Smart Repeat (User Confirmed)');
    expect(newDraft.items.length).toBe(0);

    // 4. The old draft must be FINALIZED, not deleted (history preserved)
    const oldDraftRefetched = await testDb.groceryLists.get(activeDraft.id);
    expect(oldDraftRefetched).toBeDefined();
    expect(oldDraftRefetched!.status).toBe('finalized');

    // 5. Original item still exists (attached to finalized list)
    const originalItemRefetched = await testDb.listItems.get(originalItem.id);
    expect(originalItemRefetched).toBeDefined();
    expect(originalItemRefetched!.listId).toBe(activeDraft.id);

    // 6. Only 1 draft in DB
    const allDrafts = await testDb.groceryLists.where('status').equals('draft').toArray();
    expect(allDrafts.length).toBe(1);
    expect(allDrafts[0].id).toBe(newDraft.list.id);
  });

  it('Calling createDraftList with forceNew=true multiple times in a row always yields exactly 1 draft', async () => {
    // Simulate a user spam-clicking smart-repeat
    await listRepo.createDraftList('Draft 1');
    await listRepo.createDraftList('Draft 2', undefined, true);
    await listRepo.createDraftList('Draft 3', undefined, true);
    await listRepo.createDraftList('Draft 4', undefined, true);

    const allDrafts = await testDb.groceryLists.where('status').equals('draft').toArray();
    expect(allDrafts.length).toBe(1);
    expect(allDrafts[0].title).toBe('Draft 4');

    const finalizedCount = await testDb.groceryLists.where('status').equals('finalized').count();
    expect(finalizedCount).toBe(3);
  });
});
