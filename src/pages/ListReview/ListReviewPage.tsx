import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Minus, Trash2, AlertTriangle, Edit2, Check, X } from 'lucide-react';
import { useDraftListStore } from '../../stores/useDraftListStore';
import { catalogRepository } from '../../repositories/catalogRepository';
import { historyRepository } from '../../repositories/historyRepository';
import { detectGaps, flagUnusualQuantity, type GapSuggestion } from '../../services/suggestionEngine';
import type { Category, ListItem } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';

const UNITS = ['kg', 'g', 'L', 'ml', 'pack', 'bottle', 'box', 'piece', 'dozen', 'lb', 'oz'];

interface ListReviewPageProps {
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
}

export const ListReviewPage: React.FC<ListReviewPageProps> = ({ onNavigate }) => {
  const {
    currentList,
    items,
    isLoading,
    error,
    loadDraftList,
    updateItemName,
    updateItemQuantity,
    updateItemUnit,
    updateItemPrice,
    removeItem,
    applyGapSuggestion,
    finalizeList,
    clearDraft,
  } = useDraftListStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [gaps, setGaps] = useState<GapSuggestion[]>([]);
  const [mediansMap, setMediansMap] = useState<Map<string, number>>(new Map());
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);

  // Inline Item Name Editing State
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingNameText, setEditingNameText] = useState<string>('');

  const initData = async () => {
    try {
      await loadDraftList();
      const cats = await catalogRepository.getCategories();
      setCategories(cats);

      // Load recurring item stats for gap detection & unusual quantity warnings
      const recurringStats = await historyRepository.getAllRecurringStats();
      const catalogItems = await catalogRepository.getCatalogItems();
      const catalogMap = new Map(catalogItems.map((c) => [c.id, c]));

      const medMap = new Map<string, number>();
      for (const stat of recurringStats) {
        if (stat.medianQuantity) {
          medMap.set(stat.catalogItemId, stat.medianQuantity);
        }
      }
      setMediansMap(medMap);

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

      const detectedGaps = detectGaps(draftItemIds, candidates, 0.4);
      setGaps(detectedGaps);
    } catch (err) {
      console.error('Failed to init review page:', err);
    }
  };

  useEffect(() => {
    initData();
  }, [items.length]);

  // Group items by category
  const groupedItems = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    for (const item of items) {
      let catId = 'cat-misc';
      if (item.catalogItemId) {
        // Find category if possible
        const matchedCat = categories.find((c) => c.id.includes(item.catalogItemId || ''));
        if (matchedCat) catId = matchedCat.id;
      }
      const list = map.get(catId) || [];
      list.push(item);
      map.set(catId, list);
    }
    return map;
  }, [items, categories]);

  const estimatedTotal = items.reduce((sum, item) => sum + (item.estimatedPrice || 0) * item.quantity, 0);

  const handleStartEditName = (item: ListItem) => {
    setEditingItemId(item.id);
    setEditingNameText(item.itemNameSnapshot);
  };

  const handleSaveEditName = async (itemId: string) => {
    if (editingNameText.trim()) {
      await updateItemName(itemId, editingNameText.trim());
    }
    setEditingItemId(null);
  };

  const handleFinalize = async () => {
    if (items.length === 0) return;
    setIsFinalizing(true);
    try {
      const listId = await finalizeList();
      if (listId) {
        onNavigate('/history');
      }
    } catch (err) {
      console.error('Failed to finalize list:', err);
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading your active draft list..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadDraftList} />;
  }

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      {/* Header & Budget Summary */}
      <div className="bg-white rounded-2xl p-6 border border-emerald-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <span className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider bg-emerald-100 px-2.5 py-0.5 rounded-md">
              Draft List Review
            </span>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 mt-1">
              {currentList?.title || 'Monthly Grocery List'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Review & edit item names, measurement units, quantities, estimated prices, and gap warnings.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => onNavigate('/catalog')}
              className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              + Add More Items
            </button>
            {items.length > 0 && (
              <button
                onClick={clearDraft}
                className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Budget Bar */}
        <div className="flex items-center justify-between bg-emerald-50/60 p-4 rounded-xl border border-emerald-100">
          <div>
            <span className="text-xs text-emerald-700 font-medium">Estimated Total Budget</span>
            <p className="text-2xl font-black text-emerald-950">
              ₹{estimatedTotal.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-500 font-medium">Items Count</span>
            <p className="text-lg font-bold text-gray-900">{items.length} items</p>
          </div>
        </div>
      </div>

      {/* Gap Warnings Section */}
      {gaps.length > 0 && (
        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <h3 className="text-sm font-bold text-amber-900">
              Missing Recurring Staples Warning ({gaps.length})
            </h3>
          </div>
          <p className="text-xs text-amber-800">
            The suggestion engine detected usually-recurring items missing from this list. Tap to pre-fill before saving:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            {gaps.map((gap) => (
              <div
                key={gap.catalogItemId}
                className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-sm flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-bold text-gray-900">{gap.name}</h4>
                  <p className="text-[10px] text-gray-500">
                    Suggested: {gap.suggestedQuantity} {gap.defaultUnit}
                  </p>
                </div>
                <button
                  onClick={() => applyGapSuggestion(gap)}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg shadow transition-all cursor-pointer"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List Items */}
      {items.length === 0 ? (
        <EmptyState
          title="Your list is empty"
          description="Browse the catalog to add Atta, Rice, Pulses, Spices, and household items."
          actionLabel="Browse Catalog"
          onAction={() => onNavigate('/catalog')}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(groupedItems.entries()).map(([catId, catItems]) => {
            const cat = categories.find((c) => c.id === catId);
            const categoryName = cat ? cat.name : 'Staples & Miscellaneous';

            return (
              <div key={catId} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <h3 className="text-sm font-black text-emerald-900 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100 flex items-center justify-between">
                  <span>{categoryName}</span>
                  <span className="text-xs text-gray-400 font-normal">{catItems.length} items</span>
                </h3>

                <div className="divide-y divide-gray-100">
                  {catItems.map((item) => {
                    const median = item.catalogItemId ? mediansMap.get(item.catalogItemId) : undefined;
                    const unusual = median ? flagUnusualQuantity(item.quantity, median) : null;
                    const isEditingThisName = editingItemId === item.id;

                    const isAtta =
                      item.catalogItemId === 'item-atta' || item.itemNameSnapshot.toLowerCase().includes('atta');
                    const stepQty = isAtta ? 10 : 1;

                    return (
                      <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            {isEditingThisName ? (
                              <div className="flex items-center space-x-1.5 w-full max-w-sm">
                                <input
                                  type="text"
                                  value={editingNameText}
                                  onChange={(e) => setEditingNameText(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEditName(item.id)}
                                  autoFocus
                                  aria-label="Edit item name"
                                  className="px-2.5 py-1 text-sm font-bold bg-gray-50 border border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <button
                                  onClick={() => handleSaveEditName(item.id)}
                                  aria-label="Save item name"
                                  className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingItemId(null)}
                                  aria-label="Cancel editing name"
                                  className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <h4 className="text-sm font-bold text-gray-900">{item.itemNameSnapshot}</h4>
                                <button
                                  onClick={() => handleStartEditName(item)}
                                  aria-label={`Edit name for ${item.itemNameSnapshot}`}
                                  className="p-1 text-gray-400 hover:text-emerald-600 rounded cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}

                            {unusual && unusual.isUnusual && (
                              <span
                                className="inline-flex items-center space-x-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full"
                                title={unusual.message || ''}
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Unusual Qty</span>
                              </span>
                            )}
                          </div>

                          {item.note && (
                            <p className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md mt-1 italic">
                              Note: {item.note}
                            </p>
                          )}

                          {unusual && unusual.isUnusual && (
                            <p className="text-[11px] text-amber-700 mt-1">{unusual.message}</p>
                          )}
                        </div>

                        {/* Controls Row with Editable Quantity & Unit Selection */}
                        <div className="flex items-center space-x-3 shrink-0">
                          {/* Quantity Stepper */}
                          <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl">
                            <button
                              onClick={() => updateItemQuantity(item.id, item.quantity - stepQty)}
                              aria-label={`Decrease quantity for ${item.itemNameSnapshot} by ${stepQty}`}
                              className="w-7 h-7 flex items-center justify-center bg-white text-gray-700 rounded-lg shadow-sm font-bold hover:bg-gray-50 active:scale-90 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              step={stepQty}
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 0) {
                                  updateItemQuantity(item.id, val);
                                }
                              }}
                              aria-label={`Quantity number for ${item.itemNameSnapshot}`}
                              className="w-12 text-center text-xs font-black text-gray-900 bg-white border border-gray-300 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                            />
                            <button
                              onClick={() => updateItemQuantity(item.id, item.quantity + stepQty)}
                              aria-label={`Increase quantity for ${item.itemNameSnapshot} by ${stepQty}`}
                              className="w-7 h-7 flex items-center justify-center bg-white text-gray-700 rounded-lg shadow-sm font-bold hover:bg-gray-50 active:scale-90 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Unit Selector */}
                          <select
                            value={item.unit}
                            onChange={(e) => updateItemUnit(item.id, e.target.value)}
                            aria-label={`Select measurement unit for ${item.itemNameSnapshot}`}
                            className="bg-gray-100 border-none rounded-xl text-xs font-bold text-gray-700 py-1.5 px-2 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>

                          {/* Estimated Price Input */}
                          <div className="relative w-24">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                              ₹
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Price"
                              aria-label={`Estimated price for ${item.itemNameSnapshot}`}
                              value={item.estimatedPrice ?? ''}
                              onChange={(e) =>
                                updateItemPrice(item.id, e.target.value ? Number(e.target.value) : null)
                              }
                              className="w-full pl-6 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>

                          {/* Delete Item */}
                          <button
                            onClick={() => removeItem(item.id)}
                            aria-label={`Delete ${item.itemNameSnapshot}`}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Finalize Bar */}
      {items.length > 0 && (
        <div className="fixed bottom-16 md:bottom-6 right-4 left-4 md:left-72 z-30 max-w-lg mx-auto">
          <div className="bg-emerald-900 text-white rounded-2xl p-4 shadow-2xl border border-emerald-700/50 flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-300 font-medium">Ready to shop?</span>
              <p className="text-sm font-black text-white">{items.length} items ready</p>
            </div>
            <button
              onClick={handleFinalize}
              disabled={isFinalizing}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-emerald-950 font-black text-xs rounded-xl shadow cursor-pointer transition-all disabled:opacity-50"
            >
              {isFinalizing ? 'Finalizing...' : 'Finalize & Save List →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
