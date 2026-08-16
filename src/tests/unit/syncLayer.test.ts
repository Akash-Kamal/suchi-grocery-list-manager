import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { syncManager } from '../../services/syncManager';
import { localDataMigrator } from '../../services/localDataMigrator';
import { useAuthStore } from '../../stores/useAuthStore';
import { listRepository } from '../../repositories/listRepository';

describe('Sync Layer & Offline Queue Unit Tests', () => {
  beforeEach(async () => {
    await db.open();
    await db.groceryLists.clear();
    await db.listItems.clear();
    await db.pendingSyncOps.clear();

    useAuthStore.setState({
      user: { id: 'user-test', email: 'test@example.com' } as any,
      household: { id: 'hh-test-1', name: 'Test Home' } as any,
      membership: { id: 'mem-1', role: 'owner' } as any,
    });
  });

  it('enqueues pending sync operations in Dexie when in household', async () => {
    await syncManager.enqueueOp(
      'list_items',
      'update',
      'item-1',
      { quantity: 5, unit: 'kg' }
    );

    const pending = await db.pendingSyncOps.toArray();
    expect(pending.length).toBe(1);
    expect(pending[0].tableName).toBe('list_items');
    expect(pending[0].recordId).toBe('item-1');
    expect(pending[0].payload.quantity).toBe(5);
  });

  it('does not enqueue sync operations when not in a household (pure local mode)', async () => {
    useAuthStore.setState({ household: null, membership: null });

    await syncManager.enqueueOp(
      'list_items',
      'update',
      'item-2',
      { quantity: 10 }
    );

    const pending = await db.pendingSyncOps.toArray();
    expect(pending.length).toBe(0);
  });

  it('localDataMigrator calculates device data summary accurately', async () => {
    const { list } = await listRepository.createDraftList('Local Draft 1');
    await listRepository.addItemToList(list.id, {
      catalogItemId: 'item-atta',
      itemNameSnapshot: 'Chakki Atta',
      quantity: 10,
      unit: 'kg',
      estimatedPrice: null,
      actualPrice: null,
      isPurchased: false,
      note: null,
    });
    await listRepository.addItemToList(list.id, {
      catalogItemId: 'item-milk',
      itemNameSnapshot: 'Milk',
      quantity: 2,
      unit: 'L',
      estimatedPrice: null,
      actualPrice: null,
      isPurchased: false,
      note: null,
    });

    const summary = await localDataMigrator.getLocalSummary();
    expect(summary.listsCount).toBe(1);
    expect(summary.itemsCount).toBe(2);
  });
});
