import React, { useEffect, useState } from 'react';
import { ShoppingBag, ArrowRight, PlusCircle, AlertTriangle, Sparkles, History as HistoryIcon, Trash2, X, Clock } from 'lucide-react';
import { useDraftListStore } from '../../stores/useDraftListStore';
import { historyRepository } from '../../repositories/historyRepository';
import { catalogRepository } from '../../repositories/catalogRepository';
import { isDraftStale } from '../../repositories/listRepository';
import { detectGaps, type GapSuggestion } from '../../services/suggestionEngine';
import type { GroceryList } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';

interface HomePageProps {
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { currentList, items, isLoading, error, loadDraftList, applyGapSuggestion, clearDraft } = useDraftListStore();
  const [pastLists, setPastLists] = useState<GroceryList[]>([]);
  const [gaps, setGaps] = useState<GapSuggestion[]>([]);
  const [isHomeLoading, setIsHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);

  // Custom Delete Draft Modal
  const [showDeleteDraftModal, setShowDeleteDraftModal] = useState<boolean>(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState<boolean>(false);

  const fetchData = async () => {
    setIsHomeLoading(true);
    setHomeError(null);
    try {
      await loadDraftList();
      const recent = await historyRepository.getPastLists(4);
      setPastLists(recent);

      // Compute gaps from recurring stats
      const recurringStats = await historyRepository.getAllRecurringStats();
      const catalogItems = await catalogRepository.getCatalogItems();
      const catalogMap = new Map(catalogItems.map((c) => [c.id, c]));

      const draftItemIds = new Set(items.map((i) => i.catalogItemId).filter((id): id is string => Boolean(id)));

      const candidates = recurringStats
        .map((stat) => {
          const item = catalogMap.get(stat.catalogItemId);
          if (!item) return null;
          return {
            catalogItemId: stat.catalogItemId,
            name: item.name,
            defaultUnit: item.defaultUnit,
            categoryId: item.categoryId,
            frequencyScore: stat.frequencyScore,
            medianQuantity: stat.medianQuantity,
            medianUnit: stat.medianUnit,
            lastPurchasedAt: stat.lastPurchasedAt,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      const detectedGaps = detectGaps(draftItemIds, candidates, 0.3);
      setGaps(detectedGaps.slice(0, 3));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load home data';
      setHomeError(msg);
    } finally {
      setIsHomeLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConfirmDeleteDraft = async () => {
    setIsDeletingDraft(true);
    try {
      await clearDraft();
      setShowDeleteDraftModal(false);
      await fetchData();
    } catch (err) {
      console.error('Failed to clear draft:', err);
    } finally {
      setIsDeletingDraft(false);
    }
  };

  if (isLoading || isHomeLoading) {
    return <LoadingState message="Preparing your grocery overview..." />;
  }

  if (error || homeError) {
    return <ErrorState message={error || homeError || 'An error occurred'} onRetry={fetchData} />;
  }

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * i.quantity, 0);

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-emerald-700/50">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center space-x-2 bg-emerald-950/60 backdrop-blur-md border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold text-emerald-200 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-spin" />
            <span>Smart Suggestion Engine Active</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-white">
            Namaste! Ready for this month's grocery list?
          </h1>
          <p className="text-emerald-100 text-sm md:text-base font-normal leading-relaxed opacity-95">
            Suchi learns your recurring purchases to pre-fill draft lists and warn you before you forget household staples.
          </p>
        </div>
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-4 translate-y-4">
          <ShoppingBag className="w-64 h-64 text-white" />
        </div>
      </div>

      {/* Stale Draft Notice — shown when the active draft was started in a previous month */}
      {currentList && isDraftStale(currentList) && (
        <div className="flex items-start space-x-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs">
          <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-900 dark:text-amber-300">
              This draft was started in {currentList.listMonth}
            </p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
              It looks like a previous month's list. Consider finalising it or starting a fresh list for the current month.
            </p>
          </div>
        </div>
      )}

      {/* Active Draft List Card */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-emerald-100 dark:border-slate-800 shadow-sm dark:shadow-black/40 hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-slate-800">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider mb-1">
              Active Draft List
            </span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{currentList?.title || 'Current Monthly Grocery'}</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Month: {currentList?.listMonth || new Date().toISOString().substring(0, 7)}
            </p>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={() => onNavigate('/catalog')}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold text-sm rounded-xl transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Items</span>
            </button>
            <button
              onClick={() => onNavigate('/review')}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span>Review ({items.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            {items.length > 0 && (
              <button
                onClick={() => setShowDeleteDraftModal(true)}
                title="Delete active draft list"
                aria-label="Delete active draft list"
                className="p-2.5 text-gray-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-gray-200 dark:border-slate-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-8 text-center bg-gray-50/50 dark:bg-slate-800/50 rounded-xl my-4 border border-dashed border-gray-200 dark:border-slate-700">
            <ShoppingBag className="w-10 h-10 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Your draft list is currently empty</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Browse the catalog to add Atta, Rice, Pulses, Dairy and spices with 1-tap quantity controls.
            </p>
            <button
              onClick={() => onNavigate('/catalog')}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow cursor-pointer hover:bg-emerald-700"
            >
              Explore Starter Catalog
            </button>
          </div>
        ) : (
          <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3.5 bg-emerald-50/70 dark:bg-slate-800/80 rounded-xl border border-emerald-100 dark:border-slate-700">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Distinct Items</span>
              <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">{items.length}</p>
            </div>
            <div className="p-3.5 bg-emerald-50/70 dark:bg-slate-800/80 rounded-xl border border-emerald-100 dark:border-slate-700">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Total Items Qty</span>
              <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">{itemCount}</p>
            </div>
            <div className="p-3.5 bg-emerald-50/70 dark:bg-slate-800/80 rounded-xl border border-emerald-100 dark:border-slate-700 col-span-2">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Estimated Budget</span>
              <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">
                {estimatedTotal > 0 ? `₹${estimatedTotal.toLocaleString('en-IN')}` : 'Not set'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Gap Detection Warnings Widget */}
      {gaps.length > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-950/40 rounded-2xl p-5 border border-amber-200 dark:border-amber-900/60 shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <h3 className="text-base font-bold text-amber-900 dark:text-amber-200">
              Smart Gap Detection — Missing Usually Purchased Items
            </h3>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-4">
            Based on your past history, these staple items are usually bought every month but are missing from your current draft:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {gaps.map((gap) => (
              <div key={gap.catalogItemId} className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">{gap.name}</span>
                    <span className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-full">
                      {Math.round(gap.frequencyScore * 100)}% frequent
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Suggested: {gap.suggestedQuantity} {gap.defaultUnit}
                  </p>
                </div>
                <button
                  onClick={() => applyGapSuggestion(gap)}
                  className="mt-3 w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  + Add {gap.suggestedQuantity} {gap.defaultUnit}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent History Strip */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <HistoryIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent Purchase History</h3>
          </div>
          <button
            onClick={() => onNavigate('/history')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center space-x-1 cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {pastLists.length === 0 ? (
          <EmptyState
            title="No past lists yet"
            description="Once you finalize and complete grocery shopping sessions, your recurring purchase history and frequency analytics will appear here."
            icon={HistoryIcon}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {pastLists.map((list) => (
              <div
                key={list.id}
                onClick={() => onNavigate('/history')}
                className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer bg-gray-50/50 dark:bg-slate-800/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">{list.listMonth}</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 capitalize">
                    {list.status}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{list.title}</h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  Created {new Date(list.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Delete Draft Modal */}
      {showDeleteDraftModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800 animate-scale-up">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Current Draft List?</h3>
              </div>
              <button
                onClick={() => setShowDeleteDraftModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete the active draft list? All current draft items will be cleared.
            </p>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteDraftModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteDraft}
                disabled={isDeletingDraft}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all disabled:opacity-50"
              >
                {isDeletingDraft ? 'Deleting...' : 'Yes, Delete Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
