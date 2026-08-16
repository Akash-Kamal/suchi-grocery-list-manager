import { create } from 'zustand';
import { listRepository } from '../repositories/listRepository';
import type { CatalogItem, GroceryList, ListItem } from '../types/database';
import type { GapSuggestion } from '../services/suggestionEngine';

interface DraftListState {
  currentList: GroceryList | null;
  items: ListItem[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadDraftList: () => Promise<void>;
  addItem: (catalogItem: CatalogItem, quantity?: number, unit?: string, note?: string | null) => Promise<void>;
  addCustomItem: (name: string, categoryId: string, quantity: number, unit: string, note?: string | null) => Promise<void>;
  updateItemName: (itemId: string, name: string) => Promise<void>;
  updateItemQuantity: (itemId: string, quantity: number) => Promise<void>;
  updateItemUnit: (itemId: string, unit: string) => Promise<void>;
  updateItemPrice: (itemId: string, estimatedPrice: number | null) => Promise<void>;
  updateItemNote: (itemId: string, note: string | null) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyGapSuggestion: (suggestion: GapSuggestion) => Promise<void>;
  finalizeList: () => Promise<string | null>; // Returns listId if successful
  clearDraft: () => Promise<void>;
}

export const useDraftListStore = create<DraftListState>((set, get) => ({
  currentList: null,
  items: [],
  isLoading: false,
  error: null,

  loadDraftList: async () => {
    set({ isLoading: true, error: null });
    try {
      let result = await listRepository.getCurrentDraft();
      if (!result) {
        result = await listRepository.createDraftList();
      }
      set({ currentList: result.list, items: result.items, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load draft list';
      set({ error: message, isLoading: false });
    }
  },

  addItem: async (catalogItem, quantity, unit, note = null) => {
    let { currentList, items } = get();

    if (!currentList) {
      const created = await listRepository.createDraftList();
      currentList = created.list;
      items = created.items;
      set({ currentList });
    }

    const isAtta = catalogItem.id === 'item-atta' || catalogItem.name.toLowerCase().includes('atta');
    const defaultAddQty = isAtta ? 10 : 1;
    const addQuantity = quantity !== undefined ? quantity : defaultAddQty;

    const selectedUnit = unit || catalogItem.defaultUnit || 'kg';

    // Check if item already exists in current draft
    const existingIndex = items.findIndex(
      (i) => i.catalogItemId === catalogItem.id || i.itemNameSnapshot.toLowerCase() === catalogItem.name.toLowerCase()
    );

    let updatedItems: ListItem[];

    if (existingIndex >= 0) {
      // Increase quantity of existing item
      const existing = items[existingIndex];
      const updatedItem = {
        ...existing,
        quantity: existing.quantity + addQuantity,
        note: note !== undefined ? note : existing.note,
      };
      updatedItems = [...items];
      updatedItems[existingIndex] = updatedItem;
    } else {
      // Create new snapshot-first list item
      const newItem: ListItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        listId: currentList.id,
        catalogItemId: catalogItem.id,
        itemNameSnapshot: catalogItem.name,
        quantity: addQuantity,
        unit: selectedUnit,
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: false,
        note,
        sortOrder: items.length + 1,
      };
      updatedItems = [...items, newItem];
    }

    set({ items: updatedItems });

    // Auto-save continuously to Dexie
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  addCustomItem: async (name, _categoryId, quantity, unit, note = null) => {
    let { currentList, items } = get();

    if (!currentList) {
      const created = await listRepository.createDraftList();
      currentList = created.list;
      items = created.items;
      set({ currentList });
    }

    const newItem: ListItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      listId: currentList.id,
      catalogItemId: null, // Custom non-catalog item
      itemNameSnapshot: name.trim(),
      quantity,
      unit: unit || 'pack',
      estimatedPrice: null,
      actualPrice: null,
      isPurchased: false,
      note,
      sortOrder: items.length + 1,
    };

    const updatedItems = [...items, newItem];
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  updateItemName: async (itemId, name) => {
    const { currentList, items } = get();
    if (!currentList || !name.trim()) return;

    const updatedItems = items.map((i) => (i.id === itemId ? { ...i, itemNameSnapshot: name.trim() } : i));
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  updateItemQuantity: async (itemId, quantity) => {
    const { currentList, items } = get();
    if (!currentList) return;

    if (quantity <= 0) {
      await get().removeItem(itemId);
      return;
    }

    const updatedItems = items.map((i) => (i.id === itemId ? { ...i, quantity } : i));
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  updateItemUnit: async (itemId, unit) => {
    const { currentList, items } = get();
    if (!currentList) return;

    const updatedItems = items.map((i) => (i.id === itemId ? { ...i, unit } : i));
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  updateItemPrice: async (itemId, estimatedPrice) => {
    const { currentList, items } = get();
    if (!currentList) return;

    const updatedItems = items.map((i) => (i.id === itemId ? { ...i, estimatedPrice } : i));
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  updateItemNote: async (itemId, note) => {
    const { currentList, items } = get();
    if (!currentList) return;

    const updatedItems = items.map((i) => (i.id === itemId ? { ...i, note } : i));
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  removeItem: async (itemId) => {
    const { currentList, items } = get();
    if (!currentList) return;

    const updatedItems = items.filter((i) => i.id !== itemId);
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  applyGapSuggestion: async (suggestion) => {
    let { currentList, items } = get();

    if (!currentList) {
      const created = await listRepository.createDraftList();
      currentList = created.list;
      items = created.items;
      set({ currentList });
    }

    const newItem: ListItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      listId: currentList.id,
      catalogItemId: suggestion.catalogItemId,
      itemNameSnapshot: suggestion.name,
      quantity: suggestion.suggestedQuantity || 1,
      unit: suggestion.defaultUnit || 'kg',
      estimatedPrice: null,
      actualPrice: null,
      isPurchased: false,
      note: 'Auto-suggested from recurring history',
      sortOrder: items.length + 1,
    };

    const updatedItems = [...items, newItem];
    set({ items: updatedItems });
    await listRepository.saveDraftList(currentList, updatedItems);
  },

  finalizeList: async () => {
    const { currentList, items } = get();
    if (!currentList || items.length === 0) return null;

    await listRepository.updateListStatus(currentList.id, 'finalized');
    const finalizedListId = currentList.id;

    // Reset draft state cleanly without pre-creating empty DB draft row
    set({ currentList: null, items: [] });

    return finalizedListId;
  },

  clearDraft: async () => {
    const { currentList } = get();
    if (!currentList) return;

    await listRepository.deleteList(currentList.id);
    set({ currentList: null, items: [] });
  },
}));
