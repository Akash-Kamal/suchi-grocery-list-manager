import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { CheckCircle2, Search, ArrowLeft, Check, Plus, RotateCcw, CheckSquare, Sparkles } from 'lucide-react';
import { listRepository } from '../../repositories/listRepository';
import { catalogRepository } from '../../repositories/catalogRepository';
import { historyRepository } from '../../repositories/historyRepository';
import { shoppingSessionRepository } from '../../repositories/shoppingSessionRepository';
import { calculateFrequencyScore, calculateMedianQuantity } from '../../services/suggestionEngine';
import {
  getShoppingProgress,
  getShoppingBudgetBreakdown,
  filterAndGroupShoppingItems,
} from '../../utils/listReview';
import type { Category, CatalogItem, GroceryList, ListItem, RecurringItemStat } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { CatalogPickerModal } from '../../components/catalog/CatalogPickerModal';
import { useAuthStore } from '../../stores/useAuthStore';

interface ShoppingModePageProps {
  listId: string;
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
}

export const ShoppingModePage: React.FC<ShoppingModePageProps> = ({ listId, onNavigate }) => {
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'remaining' | 'purchased'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);

  // Bulk action confirmation dialog states
  const [confirmBulkAction, setConfirmBulkAction] = useState<'mark_all' | 'reset' | null>(null);

  // Complete Catalog Picker Modal State
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);

  const household = useAuthStore((state) => state.household);
  const sessionIdRef = useRef<string | null>(null);

  const loadSessionData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const [listData, cats, catalog] = await Promise.all([
        listRepository.getListWithItems(listId),
        catalogRepository.getCategories(),
        catalogRepository.getCatalogItems(),
      ]);

      if (!listData) {
        setError('List not found');
        if (showLoading) setIsLoading(false);
        return;
      }
      setList(listData.list);
      setItems(listData.items);
      setCategories(cats);
      setCatalogItems(catalog);

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

  const handleBulkMarkAll = async (isPurchased: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, isPurchased })));
    setConfirmBulkAction(null);

    await listRepository.updateAllItemsPurchasedStatus(listId, isPurchased);
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

  // Pure deterministic calculations
  const progress = useMemo(() => getShoppingProgress(items), [items]);
  const budget = useMemo(() => getShoppingBudgetBreakdown(items), [items]);
  const groupedCategories = useMemo(() => {
    return filterAndGroupShoppingItems(items, categories, catalogItems, {
      statusFilter,
      selectedCategory,
      searchQuery,
    });
  }, [items, categories, catalogItems, statusFilter, selectedCategory, searchQuery]);

  // Extract all categories represented in the list for category filter pills
  const representedCategories = useMemo(() => {
    const allGroups = filterAndGroupShoppingItems(items, categories, catalogItems, {
      statusFilter: 'all',
      selectedCategory: 'all',
    });
    return allGroups.map((g) => ({ id: g.categoryId, name: g.categoryName, count: g.items.length }));
  }, [items, categories, catalogItems]);

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
      <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-lg border border-emerald-800 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-emerald-200">
            {household ? 'Shared Live Progress' : 'Shopping Progress'}
          </span>
          <span className="text-white">
            {progress.completed} of {progress.total} completed ({progress.percentage}%)
          </span>
        </div>

        <div
          className="w-full bg-emerald-950/80 rounded-full h-3.5 overflow-hidden p-0.5 border border-emerald-700/50"
          role="progressbar"
          aria-valuenow={progress.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Shopping progress percentage"
        >
          <div
            className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>

        {/* Budget Breakdown Summary */}
        {budget.totalBudget > 0 && (
          <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-200/90 border-t border-emerald-800/80 font-medium">
            <span>
              Spent: <strong className="text-white">₹{budget.purchasedBudget.toLocaleString('en-IN')}</strong>
            </span>
            <span>
              Remaining: <strong className="text-white">₹{budget.remainingBudget.toLocaleString('en-IN')}</strong>
            </span>
            <span>
              Total: <strong className="text-white">₹{budget.totalBudget.toLocaleString('en-IN')}</strong>
            </span>
          </div>
        )}
      </div>

      {/* 100% Completion State Celebration */}
      {progress.total > 0 && progress.remaining === 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 rounded-2xl p-5 text-center shadow-sm space-y-2 animate-fade-in">
          <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-base font-black text-emerald-950 dark:text-emerald-100">
            Shopping Complete! 🎉
          </h2>
          <p className="text-xs text-emerald-800 dark:text-emerald-300">
            All {progress.total} items on your list have been purchased.
          </p>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={handleCompleteSession}
              disabled={isCompleting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Finish & Save History ✓
            </button>
            <button
              onClick={() => setConfirmBulkAction('reset')}
              className="px-3 py-2 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-semibold rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer"
            >
              Reset Progress
            </button>
          </div>
        </div>
      )}

      {/* Status Filter Tabs & Bulk Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Status Filters */}
        <div className="flex items-center space-x-1.5 bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl w-fit">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-xs'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
            }`}
          >
            All ({progress.total})
          </button>
          <button
            onClick={() => setStatusFilter('remaining')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              statusFilter === 'remaining'
                ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-xs'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
            }`}
          >
            Remaining ({progress.remaining})
          </button>
          <button
            onClick={() => setStatusFilter('purchased')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              statusFilter === 'purchased'
                ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-xs'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
            }`}
          >
            Purchased ({progress.completed})
          </button>
        </div>

        {/* Bulk Action Triggers */}
        {items.length > 0 && (
          <div className="flex items-center space-x-2">
            {progress.remaining > 0 && (
              <button
                onClick={() => setConfirmBulkAction('mark_all')}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold rounded-xl hover:bg-emerald-100 cursor-pointer"
                title="Mark all items as purchased"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Mark All</span>
              </button>
            )}
            {progress.completed > 0 && (
              <button
                onClick={() => setConfirmBulkAction('reset')}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-[11px] font-bold rounded-xl hover:bg-gray-200 cursor-pointer"
                title="Reset shopping progress"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category Filter Pills */}
      {representedCategories.length > 1 && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-full font-bold shrink-0 transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50'
            }`}
          >
            All Categories
          </button>
          {representedCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded-full font-bold shrink-0 transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50'
              }`}
            >
              {cat.name} ({cat.count})
            </button>
          ))}
        </div>
      )}

      {/* Search & Quick Add Controls */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter grocery items..."
            aria-label="Filter shopping items"
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900/90 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>

        <button
          onClick={() => setShowCatalogModal(true)}
          className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-1 shrink-0 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Items</span>
        </button>
      </div>

      {/* Grouped Category Item Lists */}
      <div className="space-y-4">
        {groupedCategories.length === 0 ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 text-center my-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-emerald-950 dark:text-emerald-200">
              {statusFilter === 'remaining'
                ? 'All remaining items in this category are purchased!'
                : statusFilter === 'purchased'
                ? 'No items marked purchased yet.'
                : 'No items match your filter.'}
            </h3>
          </div>
        ) : (
          groupedCategories.map((group) => (
            <div key={group.categoryId} className="bg-white dark:bg-slate-900/90 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                <h3 className="text-xs font-black uppercase text-emerald-900 dark:text-emerald-400 tracking-wider">
                  {group.categoryName}
                </h3>
                <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">
                  {group.items.length} items
                </span>
              </div>

              <div className="space-y-2 pt-1">
                {group.items.map((item) => {
                  const isChecked = item.isPurchased;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleToggleBought(item.id, isChecked)}
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-label={`${isChecked ? 'Uncheck' : 'Check'} ${item.itemNameSnapshot}`}
                      className={`w-full text-left rounded-2xl p-3.5 border transition-all duration-200 flex items-center justify-between min-h-[58px] cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 ring-1 ring-emerald-400/20 shadow-2xs'
                          : 'bg-white dark:bg-slate-800/80 hover:bg-gray-50 dark:hover:bg-slate-700 border-gray-200 dark:border-slate-700 shadow-xs'
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
                          <h4
                            className={`text-sm sm:text-base font-bold truncate transition-colors ${
                              isChecked
                                ? 'text-emerald-950 dark:text-emerald-200 line-through opacity-75'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {item.itemNameSnapshot}
                          </h4>
                          {item.note && (
                            <p
                              className={`text-xs italic truncate mt-0.5 ${
                                isChecked
                                  ? 'text-emerald-800 dark:text-emerald-400 opacity-60'
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
                          className={`text-xs sm:text-sm font-black px-3 py-1.5 rounded-xl transition-colors ${
                            isChecked
                              ? 'bg-emerald-200/80 dark:bg-emerald-800/60 text-emerald-950 dark:text-emerald-200'
                              : 'bg-emerald-100 dark:bg-slate-700 text-emerald-900 dark:text-emerald-300'
                          }`}
                        >
                          {item.quantity} {item.unit}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Confirmation Modal for Bulk Actions */}
      {confirmBulkAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-gray-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-black text-gray-900 dark:text-white">
              {confirmBulkAction === 'mark_all' ? 'Mark All as Purchased?' : 'Reset Shopping Progress?'}
            </h3>
            <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
              {confirmBulkAction === 'mark_all'
                ? 'This will check off all remaining items on this grocery list.'
                : 'This will reset all items back to unpurchased status.'}
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setConfirmBulkAction(null)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBulkMarkAll(confirmBulkAction === 'mark_all')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Catalog Picker Modal */}
      <CatalogPickerModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        listId={listId}
        currentItems={items}
        onItemAdded={(added) => setItems((prev) => [...prev, added])}
        onItemUpdated={(itemId, newQty) =>
          setItems((prev) =>
            prev.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i))
          )
        }
      />
    </div>
  );
};
