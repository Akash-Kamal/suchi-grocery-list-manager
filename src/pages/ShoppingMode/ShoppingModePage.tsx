import React, { useEffect, useState, useMemo, useRef } from 'react';
import { CheckCircle2, Search, ArrowLeft, Check } from 'lucide-react';
import { listRepository } from '../../repositories/listRepository';
import { historyRepository } from '../../repositories/historyRepository';
import { shoppingSessionRepository } from '../../repositories/shoppingSessionRepository';
import { calculateFrequencyScore, calculateMedianQuantity } from '../../services/suggestionEngine';
import type { GroceryList, ListItem, RecurringItemStat } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';

interface ShoppingModePageProps {
  listId: string;
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
}

export const ShoppingModePage: React.FC<ShoppingModePageProps> = ({ listId, onNavigate }) => {
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);

  // Track the active shopping session ID for event recording
  const sessionIdRef = useRef<string | null>(null);

  const loadSessionData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const listData = await listRepository.getListWithItems(listId);
      if (!listData) {
        setError('List not found');
        setIsLoading(false);
        return;
      }
      setList(listData.list);
      setItems(listData.items);

      // Open (or resume) the shopping session for this list.
      // If the user navigated back and returned, this resumes the same open session.
      const session = await shoppingSessionRepository.openSession(listId);
      sessionIdRef.current = session.id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load shopping session';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSessionData();
    // Note: on unmount (user navigates back without finishing), the session stays open
    // (completedAt = null) — this is intentional per the audit trail spec.
    // It will not count toward recurring stats since only completed sessions do.
  }, [listId]);

  const handleToggleBought = async (itemId: string, currentPurchased: boolean) => {
    const nextStatus = !currentPurchased;

    // Toggle in local state immediately without moving items
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isPurchased: nextStatus } : item))
    );

    // Update in Dexie DB
    await listRepository.updateListItem(itemId, { isPurchased: nextStatus });

    // Record the event in the audit trail (fire-and-forget; don't block UI)
    if (sessionIdRef.current) {
      const eventType = nextStatus ? 'marked_bought' : 'unmarked';
      shoppingSessionRepository
        .recordEvent(sessionIdRef.current, itemId, eventType)
        .catch((err) => console.error('Failed to record shopping event:', err));
    }
  };

  const handleCompleteSession = async () => {
    if (!list) return;
    setIsCompleting(true);
    try {
      // 1. Mark list as completed
      await listRepository.updateListStatus(list.id, 'completed');

      // 2. Mark the session as completed (so it contributes to recurring stats)
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
    return <ErrorState message={error} onRetry={loadSessionData} />;
  }

  return (
    <div className="space-y-4 pb-28 animate-fade-in max-w-2xl mx-auto">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-emerald-100 dark:border-slate-800 shadow-sm sticky top-2 z-30">
        <button
          onClick={() => onNavigate('/review')}
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-emerald-700 p-1 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="text-center">
          <h1 className="text-sm font-black text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">
            {list?.title}
          </h1>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
            In-Store Mode Active
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
          <span className="text-emerald-200">Shopping Progress</span>
          <span className="text-white">
            {purchasedCount} of {items.length} bought ({progressPercent}%)
          </span>
        </div>

        <div className="w-full bg-emerald-950/80 rounded-full h-3 overflow-hidden p-0.5 border border-emerald-700/50">
          <div
            className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* In-Session Search Filter */}
      <div className="relative">
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

      {/* Unified In-Place List (Items Stay In Place & Highlight When Checked) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase text-gray-500 dark:text-slate-400 tracking-wider">
            Grocery Items ({filteredItems.length})
          </h2>
          <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Tap item to check / uncheck</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 text-center my-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-emerald-950 dark:text-emerald-200">No items match search</h3>
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
                  className={`w-full text-left rounded-2xl p-4 border transition-all duration-200 flex items-center justify-between min-h-[56px] cursor-pointer ${
                    isChecked
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-400 dark:border-emerald-600 ring-1 ring-emerald-400/30 shadow-xs'
                      : 'bg-white dark:bg-slate-900/90 hover:bg-gray-50 dark:hover:bg-slate-800 border-gray-200 dark:border-slate-800 shadow-sm'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {/* Circle Checkbox */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isChecked
                          ? 'bg-emerald-600 text-white shadow-sm scale-105'
                          : 'border-2 border-gray-300 dark:border-slate-600 text-transparent bg-white dark:bg-slate-800'
                      }`}
                    >
                      <Check className={`w-4 h-4 ${isChecked ? 'stroke-[3]' : ''}`} />
                    </div>

                    {/* Item Name & Note */}
                    <div>
                      <h3
                        className={`text-sm font-bold transition-colors ${
                          isChecked ? 'text-emerald-950 dark:text-emerald-200 line-through opacity-85' : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {item.itemNameSnapshot}
                      </h3>
                      {item.note && (
                        <p
                          className={`text-[11px] italic mt-0.5 ${
                            isChecked ? 'text-emerald-800 dark:text-emerald-400 opacity-75' : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Quantity Badge */}
                  <div className="text-right shrink-0 pl-3">
                    <span
                      className={`text-sm font-black px-3 py-1 rounded-xl transition-colors ${
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
