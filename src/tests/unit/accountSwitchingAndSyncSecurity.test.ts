import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDraftListStore } from '../../stores/useDraftListStore';
import { syncManager } from '../../services/syncManager';

describe('Multi-User Account Switching & Sync Security Regression Tests', () => {
  beforeEach(async () => {
    await db.groceryLists.clear();
    await db.listItems.clear();
    await db.pendingSyncOps.clear();
    await db.favorites.clear();

    useAuthStore.setState({
      user: null,
      session: null,
      household: null,
      membership: null,
      isLoading: false,
      isInitialized: false,
      error: null,
    });

    useDraftListStore.setState({
      currentList: null,
      items: [],
      isLoading: false,
      error: null,
    });
  });

  it('purges local Dexie lists and resets draft store when User A signs out', async () => {
    // 1. User A is active and creates local list data
    useAuthStore.setState({
      user: { id: 'user-a', email: 'usera@example.com' } as any,
      household: { id: 'hh-a', name: 'Household A' } as any,
      membership: { id: 'mem-a', role: 'owner' } as any,
    });

    await db.groceryLists.put({
      id: 'list-user-a',
      title: "User A's Private List",
      listMonth: '2026-08',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.listItems.put({
      id: 'item-user-a',
      listId: 'list-user-a',
      catalogItemId: 'item-atta',
      itemNameSnapshot: 'Chakki Fresh Atta',
      quantity: 10,
      unit: 'kg',
      isPurchased: false,
      estimatedPrice: null,
      actualPrice: null,
      note: 'User A private note',
      sortOrder: 0,
    });

    useDraftListStore.setState({
      currentList: {
        id: 'list-user-a',
        title: "User A's Private List",
        listMonth: '2026-08',
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      items: [
        {
          id: 'item-user-a',
          listId: 'list-user-a',
          catalogItemId: 'item-atta',
          itemNameSnapshot: 'Chakki Fresh Atta',
          quantity: 10,
          unit: 'kg',
          isPurchased: false,
          estimatedPrice: null,
          actualPrice: null,
          note: 'User A private note',
          sortOrder: 0,
        },
      ],
    });

    expect(await db.groceryLists.count()).toBe(1);
    expect(await db.listItems.count()).toBe(1);

    // 2. User A signs out
    await useAuthStore.getState().signOut();

    // 3. Verify Dexie and draft stores are completely purged
    expect(await db.groceryLists.count()).toBe(0);
    expect(await db.listItems.count()).toBe(0);
    expect(await db.pendingSyncOps.count()).toBe(0);
    expect(useDraftListStore.getState().currentList).toBeNull();
    expect(useDraftListStore.getState().items).toHaveLength(0);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('tags pendingSyncOps with authenticated userId and householdId', async () => {
    useAuthStore.setState({
      user: { id: 'user-a', email: 'usera@example.com' } as any,
      household: { id: 'hh-a', name: 'Household A' } as any,
    });

    await syncManager.enqueueOp('list_items', 'insert', 'item-123', {
      quantity: 5,
    });

    const ops = await db.pendingSyncOps.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].userId).toBe('user-a');
    expect(ops[0].householdId).toBe('hh-a');
    expect(ops[0].recordId).toBe('item-123');
  });

  it('quarantines and refuses to flush sync operations belonging to a different user/household', async () => {
    // Manually place a queued op belonging to User A
    await db.pendingSyncOps.add({
      id: 'op-user-a',
      tableName: 'list_items',
      operation: 'insert',
      recordId: 'item-stale',
      payload: { quantity: 2 },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: 'user-a',
      householdId: 'hh-a',
    });

    // User B is currently logged in with Household B
    useAuthStore.setState({
      user: { id: 'user-b', email: 'userb@example.com' } as any,
      household: { id: 'hh-b', name: 'Household B' } as any,
    });

    // Flush attempt under User B
    await syncManager.flushPendingOps();

    // Stale User A op must NOT be executed or deleted under User B's context
    const remainingOps = await db.pendingSyncOps.toArray();
    expect(remainingOps).toHaveLength(1);
    expect(remainingOps[0].id).toBe('op-user-a');
  });
});
