import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, Heart, Plus, Minus, X, Edit2, Trash2, Check, Scale, TrendingUp } from 'lucide-react';
import { catalogRepository } from '../../repositories/catalogRepository';
import { useDraftListStore } from '../../stores/useDraftListStore';
import type { CatalogItem, Category } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';

const ALL_UNITS = ['kg', 'g', 'L', 'ml', 'pack', 'bottle', 'box', 'piece', 'dozen', 'lb', 'oz'];

interface CatalogPageProps {
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ onNavigate }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Custom Item Modal State
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<string>('cat-kitchen');
  const [customUnit, setCustomUnit] = useState<string>('pack');

  // Edit Catalog Item Modal State
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('cat-kitchen');
  const [editUnit, setEditUnit] = useState<string>('kg');

  // Delete Catalog Item Confirmation Modal State
  const [deletingItem, setDeletingItem] = useState<CatalogItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Phase 2: Frequency scores per catalog item
  const [frequencyScoreMap, setFrequencyScoreMap] = useState<Map<string, number>>(new Map());
  const [sortByFrequency, setSortByFrequency] = useState<boolean>(false);

  // Local draft quantities map for fast UI response
  const { items: draftItems, addItem, updateItemQuantity, loadDraftList } = useDraftListStore();

  // Create a map of catalogItemId -> draftListItem
  const draftMap = useMemo(() => {
    const map = new Map<string, { id: string; quantity: number; unit: string }>();
    for (const item of draftItems) {
      if (item.catalogItemId) {
        map.set(item.catalogItemId, { id: item.id, quantity: item.quantity, unit: item.unit });
      }
    }
    return map;
  }, [draftItems]);

  // Debounce search query input (250ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadDraftList();
      const cats = await catalogRepository.getCategories();
      const favs = await catalogRepository.getFavorites();
      setCategories(cats);
      setFavorites(new Set(favs.map((f) => f.id)));

      const items = await catalogRepository.searchCatalog(debouncedQuery, selectedCategory);
      setCatalogItems(items);

      // Load frequency scores for all catalog items (for "Usually bought" badges)
      const itemsWithScores = await catalogRepository.getItemsWithFrequencyScores();
      setFrequencyScoreMap(new Map(itemsWithScores.map((i) => [i.id, i.frequencyScore])));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load catalog';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, loadDraftList, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleFavorite = async (catalogItemId: string) => {
    try {
      const isFavNow = await catalogRepository.toggleFavorite(catalogItemId);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFavNow) next.add(catalogItemId);
        else next.delete(catalogItemId);
        return next;
      });
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleAddCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    try {
      const newCustom = await catalogRepository.addCustomCatalogItem({
        categoryId: customCategory,
        name: customName.trim(),
        defaultUnit: customUnit,
      });

      // Add to active draft list immediately
      await addItem(newCustom, undefined, customUnit);

      setCustomName('');
      setShowCustomModal(false);
      await loadData();
    } catch (err) {
      console.error('Failed to add custom item:', err);
    }
  };

  const handleStartEditItem = (item: CatalogItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.categoryId);
    setEditUnit(item.defaultUnit);
  };

  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editName.trim()) return;

    try {
      await catalogRepository.updateCatalogItem(editingItem.id, {
        name: editName.trim(),
        categoryId: editCategory,
        defaultUnit: editUnit,
      });

      setEditingItem(null);
      await loadData();
    } catch (err) {
      console.error('Failed to update catalog item:', err);
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      await catalogRepository.deleteCatalogItem(deletingItem.id);
      setDeletingItem(null);
      await loadData();
    } catch (err) {
      console.error('Failed to delete catalog item:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Header & Search Bar */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-5 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">Grocery Catalog</h1>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Select, edit, or delete catalog items and change measurement units</p>
          </div>
          <button
            onClick={() => setShowCustomModal(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-md shadow-emerald-950/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Custom Item</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items or Hindi names (e.g. Atta, Pyaz, Maggi, Haldi)..."
            aria-label="Search catalog items"
            className="w-full pl-11 pr-10 py-3 bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => setSelectedCategory('favorites')}
            className={`inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === 'favorites'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60'
            }`}
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>Favorites</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}

          {/* Sort: Frequently Bought First toggle */}
          <button
            onClick={() => setSortByFrequency((prev) => !prev)}
            aria-pressed={sortByFrequency}
            aria-label="Sort by frequently bought"
            className={`inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              sortByFrequency
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Frequently Bought</span>
          </button>
        </div>
      </div>

      {/* Catalog Grid */}
      {isLoading ? (
        <LoadingState message="Searching catalog items..." />
      ) : catalogItems.length === 0 ? (
        <EmptyState
          title="No catalog items found"
          description={`No items match "${debouncedQuery}". You can add a custom item to your list.`}
          actionLabel="+ Add Custom Item"
          onAction={() => setShowCustomModal(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {(sortByFrequency
            ? [...catalogItems].sort((a, b) => (frequencyScoreMap.get(b.id) ?? 0) - (frequencyScoreMap.get(a.id) ?? 0))
            : catalogItems
          ).map((item) => {
            const isFav = favorites.has(item.id);
            const draftEntry = draftMap.get(item.id);
            const inDraft = Boolean(draftEntry);
            const currentQty = draftEntry?.quantity || 0;
            const itemFreqScore = frequencyScoreMap.get(item.id) ?? 0;
            const isUsuallyBought = itemFreqScore >= 0.5;

            const isAtta = item.id === 'item-atta' || item.name.toLowerCase().includes('atta');
            const stepQty = isAtta ? 10 : 1;

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-slate-900/90 rounded-2xl p-4 border transition-all duration-200 flex flex-col justify-between ${
                  inDraft
                    ? 'border-emerald-500 dark:border-emerald-500 shadow-md ring-1 ring-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/40'
                    : 'border-gray-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-slate-700 hover:shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{item.name}</h3>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleStartEditItem(item)}
                        title="Edit Item"
                        aria-label={`Edit ${item.name}`}
                        className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-full transition-colors cursor-pointer hover:bg-emerald-50 dark:hover:bg-slate-800"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingItem(item)}
                        title="Delete Item"
                        aria-label={`Delete ${item.name}`}
                        className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-full transition-colors cursor-pointer hover:bg-red-50 dark:hover:bg-slate-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleFavorite(item.id)}
                        aria-label={isFav ? `Unfavorite ${item.name}` : `Favorite ${item.name}`}
                        className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                          isFav ? 'text-rose-500 bg-rose-50 dark:bg-rose-950/60' : 'text-gray-300 dark:text-slate-600 hover:text-rose-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-md flex items-center space-x-1">
                      <Scale className="w-2.5 h-2.5 text-gray-400 dark:text-slate-500" />
                      <span>Unit: {isAtta ? '10 kg' : item.defaultUnit}</span>
                    </span>
                    {isUsuallyBought && (
                      <span className="inline-flex items-center space-x-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        <TrendingUp className="w-2.5 h-2.5" />
                        <span>Usually bought</span>
                      </span>
                    )}
                    {item.isCustom && (
                      <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950 px-2 py-0.5 rounded-md">
                        Custom
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline Stepper Controls with Direct Editable Quantity Input */}
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                  {inDraft && draftEntry ? (
                    <div className="flex items-center space-x-2 w-full justify-between">
                      <div className="flex items-center space-x-1.5 bg-emerald-100/70 dark:bg-emerald-950/60 p-1 rounded-xl">
                        <button
                          onClick={() => updateItemQuantity(draftEntry.id, currentQty - stepQty)}
                          aria-label={`Decrease quantity of ${item.name} by ${stepQty}`}
                          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 rounded-lg shadow-sm font-bold hover:bg-emerald-50 dark:hover:bg-slate-700 active:scale-90 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          step={stepQty}
                          value={currentQty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 0) {
                              updateItemQuantity(draftEntry.id, val);
                            }
                          }}
                          aria-label={`Quantity for ${item.name}`}
                          className="w-12 text-center text-xs font-black text-emerald-950 dark:text-emerald-200 bg-white/90 dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                        />
                        <button
                          onClick={() => updateItemQuantity(draftEntry.id, currentQty + stepQty)}
                          aria-label={`Increase quantity of ${item.name} by ${stepQty}`}
                          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 rounded-lg shadow-sm font-bold hover:bg-emerald-50 dark:hover:bg-slate-700 active:scale-90 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg">
                        {draftEntry.unit}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => addItem(item, stepQty, item.defaultUnit)}
                      className="w-full flex items-center justify-center space-x-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add {stepQty} {item.defaultUnit}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Bar when items selected */}
      {draftItems.length > 0 && (
        <div className="fixed bottom-16 md:bottom-6 right-4 left-4 md:left-72 z-30 max-w-lg mx-auto">
          <div className="bg-emerald-950 dark:bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-emerald-700/50 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-300 dark:text-emerald-400 font-medium">Items in draft:</span>
              <p className="text-sm font-black text-white">{draftItems.length} items added</p>
            </div>
            <button
              onClick={() => onNavigate('/review')}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
            >
              Review List →
            </button>
          </div>
        </div>
      )}

      {/* Modal for Adding Custom Item */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Custom Household Item</h2>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Organic Jaggery / Gud"
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Default Unit</label>
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {ALL_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2.5 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer"
                >
                  Add to Catalog & Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Editing Catalog Item & Changing Measurement System/Unit */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Item Details & Measurement</h2>
              <button
                onClick={() => setEditingItem(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Measurement Unit</label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-800 dark:text-emerald-400"
                  >
                    {ALL_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2.5 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer flex items-center space-x-1"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Deleting Catalog Item */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-red-600 dark:text-red-400">Delete Item from Catalog?</h3>
              <button
                onClick={() => setDeletingItem(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-gray-900 dark:text-white">"{deletingItem.name}"</strong> from your catalog?
            </p>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteItem}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
