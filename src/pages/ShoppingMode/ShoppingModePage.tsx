import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { CheckCircle2, Search, ArrowLeft, Check, Plus, X } from 'lucide-react';
import { listRepository } from '../../repositories/listRepository';
import { historyRepository } from '../../repositories/historyRepository';
import { shoppingSessionRepository } from '../../repositories/shoppingSessionRepository';
import { calculateFrequencyScore, calculateMedianQuantity } from '../../services/suggestionEngine';
import type { GroceryList, ListItem, RecurringItemStat } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuthStore } from '../../stores/useAuthStore';

interface ShoppingModePageProps {
  listId: string;
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
}

const COMMON_UNITS: string[] = ['kg', 'g', 'L', 'ml', 'pack', 'pcs', 'bottle', 'dozen'];

export const ShoppingModePage: React.FC<ShoppingModePageProps> = ({ listId, onNavigate }) => {
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);

  // Quick Add Item on the fly
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [newItemUnit, setNewItemUnit] = useState<string>('kg');
  const [isAddingItem, setIsAddingItem] = useState<boolean>(false);

  const household = useAuthStore((state) => state.household);

  // Track the active shopping session ID for event recording
  const sessionIdRef = useRef<string | null>(null);

  const loadSessionData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const listData = await listRepository.getListWithItems(listId);
      if (!listData) {
        setError('List not found');
        if (showLoading) setIsLoading(false);
        return;
      }
      setList(listData.list);
      setItems(listData.items);

      // Open or resume shopping session
      if (!sessionIdRef.current) {
        const session = await shoppingSessionRepository.openSession(listId);
        sessionIdRef.current = session.id;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load shopping session';
      setError(msg);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    loadSessionData(true);

    // Listen for realtime item updates from other household shoppers
    const handleRealtimeItemChange = (e: Event) => {
      const customEv = e as CustomEvent;
      if (!customEv.detail || customEv.detail.listId === listId || customEv.detail.eventType === 'DELETE') {
        loadSessionData(false);
      }
    };

    window.addEventListener('suchi:list_item_changed', handleRealtimeItemChange);
    window.addEventListener('suchi:list_changed', handleRealtimeItemChange);

    return () => {
      window.removeEventListener('suchi:list_item_changed', handleRealtimeItemChange);
      window.removeEventListener('suchi:list_changed', handleRealtimeItemChange);
    };
  }, [loadSessionData, listId]);

  const handleToggleBought = async (itemId: string, currentPurchased: boolean) => {
    const nextStatus = !currentPurchased;

    // Toggle in local state immediately without jumping
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isPurchased: nextStatus } : item))
    );

    // Update in Dexie DB & Sync to Supabase
    await listRepository.updateListItem(itemId, { isPurchased: nextStatus });

    // Record the event in shopping session audit trail
    if (sessionIdRef.current) {
      const eventType = nextStatus ? 'marked_bought' : 'unmarked';
      shoppingSessionRepository
        .recordEvent(sessionIdRef.current, itemId, eventType)
        .catch((err) => console.error('Failed to record shopping event:', err));
    }
  };

  const handleQuickAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    setIsAddingItem(true);
    try {
      const added = await listRepository.addItemToList(listId, {
        catalogItemId: null,
        itemNameSnapshot: newItemName.trim(),
        quantity: newItemQty || 1,
        unit: newItemUnit || 'kg',
        estimatedPrice: null,
        actualPrice: null,
        isPurchased: false,
        note: null,
      });

      setItems((prev) => [...prev, added]);
      setNewItemName('');
      setNewItemQty(1);
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add item during shopping:', err);
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!list) return;
    setIsCompleting(true);
    try {
      // 1. Mark list as completed
      await listRepository.updateListStatus(list.id, 'completed');

      // 2. Mark the session as completed
      if (sessionIdRef.current) {
        await shoppingSessionRepository.completeSession(sessionIdRef.current);
      }

      // 3. Recalculate recurring stats for catalog items across all past completed lists
      const historyMap = await historyRepository.getAllItemHistories();
      const pastLists = await historyRepository.getPastLists(100);
      const totalPastLists = Math.max(1, pastLists.length);

      const newStats: RecurringItemStat[] = [];
      for (const [catalogItemId, historyRecords] of historyMap.entries()) {
        const occurrences = historyRecords.length;
        const freqScore = calculateFrequencyScore(occurrences, totalPastLists);
        const quantities = historyRecords.map((r) => r.item.quantity);
        const medianQty = calculateMedianQuantity(quantities);
        const latest = historyRecords.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

        newStats.push({
          id: `stat-${catalogItemId}`,
          catalogItemId,
          frequencyScore: freqScore,
          medianQuantity: medianQty,
          medianUnit: latest?.item.unit || 'kg',
          lastPurchasedAt: latest?.createdAt || new Date().toISOString(),
          typicalIntervalDays: 30,
        });
      }

      if (newStats.length > 0) {
        await historyRepository.updateRecurringStats(newStats);
      }

      onNavigate('/history');
    } catch (err) {
      console.error('Error completing session:', err);
    } finally {
      setIsCompleting(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((i) => i.itemNameSnapshot.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const purchasedCount = items.filter((i) => i.isPurchased).length;
  const progressPercent =
    items.length > 0 ? Math.round((purchasedCount / items.length) * 100) : 0;

  if (isLoading) {
    return <LoadingState message="Starting in-store shopping session..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => loadSessionData(true)} />;
  }

  return (
    <div className="space-y-4 pb-28 animate-fade-in max-w-2xl mx-auto">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-emerald-100 dark:border-slate-800 shadow-sm sticky top-2 z-30">
        <button
          onClick={() => onNavigate('/history')}
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-emerald-700 p-1 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit</span>
        </button>

        <div className="text-center">
          <div className="flex items-center justify-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-sm font-black text-gray-900 dark:text-white truncate max-w-[180px] sm:max-w-xs">
              {list?.title}
            </h1>
          </div>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
            {household ? 'SHOPPING TOGETHER 🟢 LIVE' : 'In-Store Mode'}
          </span>
        </div>

        <button
          onClick={handleCompleteSession}
          disabled={isCompleting}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer disabled:opacity-50"
        >
          {isCompleting ? 'Saving...' : 'Finish ✓'}
        </button>
      </div>

      {/* Persistent Progress Bar Card */}
      <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-lg border border-emerald-800 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-emerald-200">
            {household ? 'Shared Live Progress' : 'Shopping Progress'}
          </span>
          <span className="text-white">
            {purchasedCount} / {items.length} completed ({progressPercent}%)
          </span>
        </div>

        <div className="w-full bg-emerald-950/80 rounded-full h-3.5 overflow-hidden p-0.5 border border-emerald-700/50">
          <div
            className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Search & Quick Add Controls */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter grocery items..."
            aria-label="Filter remaining items"
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900/90 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-1 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </div>

      {/* Quick Add Form in Shopping Mode */}
      {showAddForm && (
        <form
          onSubmit={handleQuickAddItem}
          className="bg-white dark:bg-slate-900/90 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-3 animate-fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase text-gray-700 dark:text-slate-200 tracking-wider">
              Add Item in Store
            </h4>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Item name"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="sm:col-span-2 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
            <input
              type="number"
              min="0.1"
              step="any"
              value={newItemQty}
              onChange={(e) => setNewItemQty(Number(e.target.value))}
              placeholder="Qty"
              className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <select
              value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
              className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAddingItem || !newItemName.trim()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow cursor-pointer disabled:opacity-50"
            >
              {isAddingItem ? 'Adding...' : 'Add to List'}
            </button>
          </div>
        </form>
      )}

      {/* Unified In-Place List (Items Stay In Place & Highlight When Checked) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase text-gray-500 dark:text-slate-400 tracking-wider">
            Items ({filteredItems.length})
          </h2>
          <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">
            Tap anywhere on an item to mark / unmark
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 text-center my-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-emerald-950 dark:text-emerald-200">No items match</h3>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const isChecked = item.isPurchased;

              return (
                <button
                  key={item.id}
                  onClick={() => handleToggleBought(item.id, isChecked)}
                  aria-label={`${isChecked ? 'Uncheck' : 'Check'} ${item.itemNameSnapshot}`}
                  className={`w-full text-left rounded-2xl p-4 border transition-all duration-200 flex items-center justify-between min-h-[60px] cursor-pointer ${
                    isChecked
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-400 dark:border-emerald-600 ring-1 ring-emerald-400/30 shadow-xs'
                      : 'bg-white dark:bg-slate-900/90 hover:bg-gray-50 dark:hover:bg-slate-800 border-gray-200 dark:border-slate-800 shadow-sm'
                  }`}
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    {/* Large Circle Checkbox */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isChecked
                          ? 'bg-emerald-600 text-white shadow-sm scale-105'
                          : 'border-2 border-gray-300 dark:border-slate-600 text-transparent bg-white dark:bg-slate-800'
                      }`}
                    >
                      <Check className={`w-5 h-5 ${isChecked ? 'stroke-[3]' : ''}`} />
                    </div>

                    {/* Item Name & Note */}
                    <div className="min-w-0">
                      <h3
                        className={`text-base font-bold truncate transition-colors ${
                          isChecked
                            ? 'text-emerald-950 dark:text-emerald-200 line-through opacity-80'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {item.itemNameSnapshot}
                      </h3>
                      {item.note && (
                        <p
                          className={`text-xs italic truncate mt-0.5 ${
                            isChecked
                              ? 'text-emerald-800 dark:text-emerald-400 opacity-70'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Large Quantity Badge */}
                  <div className="text-right shrink-0 pl-3">
                    <span
                      className={`text-sm font-black px-3 py-1.5 rounded-xl transition-colors ${
                        isChecked
                          ? 'bg-emerald-200/80 dark:bg-emerald-800/60 text-emerald-950 dark:text-emerald-200'
                          : 'bg-emerald-100 dark:bg-slate-800 text-emerald-900 dark:text-emerald-300'
                      }`}
                    >
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
