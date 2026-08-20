import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  X,
  Plus,
  Minus,
  Heart,
  Package,
  Utensils,
  Sparkles,
  Broom,
  Coffee,
  Cookie,
  Baby,
  Dog,
  QrCode,
} from 'lucide-react';
import { catalogRepository } from '../../repositories/catalogRepository';
import { listRepository } from '../../repositories/listRepository';
import { historyRepository } from '../../repositories/historyRepository';
import { useDraftListStore } from '../../stores/useDraftListStore';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import type { OnlineBarcodeProduct } from '../../services/barcodeProductLookup';
import {
  searchCatalogItems,
  getHighlightedChunks,
  findMatchingAlias,
} from '../../utils/catalogSearch';
import {
  getDefaultQuantity,
  incrementQuantity,
  decrementQuantity,
} from '../../utils/catalogQuantity';
import {
  getSuggestedCatalogItems,
} from '../../utils/catalogSuggestions';
import {
  getContextualCatalogSuggestions,
} from '../../utils/catalogCompletion';
import {
  findMatchingListItem,
  normalizeItemName,
} from '../../utils/catalogItemIdentity';
import type { CatalogItem, Category, ItemAlias, ListItem, RecurringItemStat } from '../../types/database';

export interface CatalogPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  listId?: string; // Optional: If provided, adds to this specific list (History or Shopping). If omitted, adds to active draft.
  currentItems: ListItem[];
  onItemAdded?: (item: ListItem) => void;
  onItemUpdated?: (itemId: string, newQty: number) => void;
}

const COMMON_UNITS: string[] = ['kg', 'g', 'L', 'ml', 'pack', 'pcs', 'bottle', 'dozen'];
const MAX_VISIBLE_RESULTS = 100;

// Helper to render category icon
const getCategoryIcon = (catId?: string) => {
  switch (catId) {
    case 'cat-kitchen':
      return <Utensils className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case 'cat-personal':
      return <Sparkles className="w-4 h-4 text-pink-600 dark:text-pink-400" />;
    case 'cat-cleaning':
      return <Broom className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
    case 'cat-beverages':
      return <Coffee className="w-4 h-4 text-amber-700 dark:text-amber-500" />;
    case 'cat-snacks':
      return <Cookie className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
    case 'cat-baby':
      return <Baby className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    case 'cat-pet':
      return <Dog className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    default:
      return <Package className="w-4 h-4 text-gray-500 dark:text-slate-400" />;
  }
};

/**
 * Visual substring highlighter for search query matches.
 */
export const HighlightMatch: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const chunks = useMemo(() => getHighlightedChunks(text, query), [text, query]);

  if (!query.trim()) {
    return <>{text}</>;
  }

  return (
    <>
      {chunks.map((chunk, idx) =>
        chunk.isMatch ? (
          <mark
            key={idx}
            className="bg-emerald-200/90 dark:bg-emerald-500/40 text-emerald-950 dark:text-emerald-100 rounded-xs px-0.5 font-black not-italic"
          >
            {chunk.text}
          </mark>
        ) : (
          <span key={idx}>{chunk.text}</span>
        )
      )}
    </>
  );
};

export const CatalogPickerModal: React.FC<CatalogPickerModalProps> = ({
  isOpen,
  onClose,
  listId,
  currentItems,
  onItemAdded,
  onItemUpdated,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
  const [aliases, setAliases] = useState<ItemAlias[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recurringStats, setRecurringStats] = useState<RecurringItemStat[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customUnit, setCustomUnit] = useState<string>('pack');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState<boolean>(false);
  const pendingActionRef = useRef<Set<string>>(new Set());

  // Fallback for draft list store if listId is not supplied
  const { addItem: addDraftItem, updateItemQuantity: updateDraftQuantity } = useDraftListStore();

  // Create a map of catalogItemId/itemNameSnapshot -> ListItem for quick duplicate detection & quantity display
  const existingItemsMap = useMemo(() => {
    const map = new Map<string, ListItem>();
    for (const item of currentItems) {
      if (item.catalogItemId) {
        map.set(item.catalogItemId, item);
      }
      // Also map by normalized snapshot name
      map.set(normalizeItemName(item.itemNameSnapshot), item);
    }
    return map;
  }, [currentItems]);

  // In-memory alias lookup map: catalogItemId -> lowercase alias strings
  const aliasMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const alias of aliases) {
      const list = map.get(alias.catalogItemId);
      const text = alias.aliasText.toLowerCase();
      if (list) {
        list.push(text);
      } else {
        map.set(alias.catalogItemId, [text]);
      }
    }
    return map;
  }, [aliases]);

  // Load catalog items, categories, favorites, aliases, and recurring stats once when modal opens
  const loadCatalogData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cats, items, favs, itemAliases, stats] = await Promise.all([
        catalogRepository.getCategories(),
        catalogRepository.getCatalogItems(),
        catalogRepository.getFavorites(),
        catalogRepository.getItemAliases(),
        historyRepository.getAllRecurringStats(),
      ]);
      setCategories(cats);
      setAllItems(items);
      setFavorites(new Set(favs.map((f) => f.catalogItemId)));
      setAliases(itemAliases);
      setRecurringStats(stats);
    } catch (err) {
      console.error('Failed to load catalog data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCatalogData();
      setSearchQuery('');
      setSelectedCategory('all');
    }
  }, [isOpen, loadCatalogData]);

  // Pure deterministic suggestions (top 8) based on purchase history and favorites
  const suggestions = useMemo(() => {
    return getSuggestedCatalogItems(allItems, recurringStats, favorites, { limit: 8 });
  }, [allItems, recurringStats, favorites]);

  // Contextual smart list completion (top 6) based on items already in the current list
  const contextualCompletions = useMemo(() => {
    return getContextualCatalogSuggestions(allItems, currentItems, recurringStats, favorites, { limit: 6 });
  }, [allItems, currentItems, recurringStats, favorites]);

  // Local in-memory filtering with favorites-first empty search and STEP 3 search ranking
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim();

    // 4.2 Favorites-First Empty Search
    if (!q) {
      if (selectedCategory === 'favorites') {
        return allItems.filter((item) => favorites.has(item.id));
      }
      if (selectedCategory !== 'all') {
        return allItems.filter((item) => item.categoryId === selectedCategory);
      }
      // If 'all', show favorites first in original catalog order, then remaining items in original catalog order
      const favItems = allItems.filter((item) => favorites.has(item.id));
      const nonFavItems = allItems.filter((item) => !favorites.has(item.id));
      return [...favItems, ...nonFavItems];
    }

    // Non-empty query: STEP 3 search ranking
    let list = allItems;
    if (selectedCategory === 'favorites') {
      list = list.filter((item) => favorites.has(item.id));
    } else if (selectedCategory !== 'all') {
      list = list.filter((item) => item.categoryId === selectedCategory);
    }

    return searchCatalogItems(list, q, aliasMap);
  }, [allItems, searchQuery, selectedCategory, favorites, aliasMap]);

  // 4.3 Visible Results Limiting for rendering scalability
  const visibleItems = useMemo(() => filteredItems.slice(0, MAX_VISIBLE_RESULTS), [filteredItems]);

  // Handle Add / Increment Item with rapid-click lock
  const handleAddCatalogItem = async (catalogItem: CatalogItem) => {
    if (pendingActionRef.current.has(catalogItem.id)) return;
    pendingActionRef.current.add(catalogItem.id);

    try {
      const existing =
        existingItemsMap.get(catalogItem.id) ||
        findMatchingListItem(currentItems, { catalogItemId: catalogItem.id, name: catalogItem.name }, aliasMap);

      if (existing) {
        // Duplicate item found: increment quantity using smart step
        const newQty = incrementQuantity(existing.quantity, catalogItem.defaultUnit || existing.unit);
        if (listId) {
          await listRepository.updateListItem(existing.id, { quantity: newQty });
          if (onItemUpdated) onItemUpdated(existing.id, newQty);
        } else {
          await updateDraftQuantity(existing.id, newQty);
        }
        return;
      }

      // New item: create and add with smart default quantity
      const defaultQty = getDefaultQuantity(catalogItem.defaultUnit);

      if (listId) {
        const added = await listRepository.addItemToList(listId, {
          catalogItemId: catalogItem.id,
          itemNameSnapshot: catalogItem.name,
          quantity: defaultQty,
          unit: catalogItem.defaultUnit || 'kg',
          estimatedPrice: null,
          actualPrice: null,
          isPurchased: false,
          note: null,
        });
        if (onItemAdded) onItemAdded(added);
      } else {
        await addDraftItem(catalogItem, defaultQty, catalogItem.defaultUnit || 'kg');
      }
    } finally {
      pendingActionRef.current.delete(catalogItem.id);
    }
  };

  // Handle Quick Custom Item Add (if search query doesn't match standard items)
  const handleAddCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = searchQuery.trim();
    if (!name) return;

    setIsAddingCustom(true);
    try {
      const existing =
        existingItemsMap.get(normalizeItemName(name)) ||
        findMatchingListItem(currentItems, { catalogItemId: null, name }, aliasMap);

      if (existing) {
        const newQty = incrementQuantity(existing.quantity, customUnit || existing.unit);
        if (listId) {
          await listRepository.updateListItem(existing.id, { quantity: newQty });
          if (onItemUpdated) onItemUpdated(existing.id, newQty);
        } else {
          await updateDraftQuantity(existing.id, newQty);
        }
      } else {
        const defaultQty = getDefaultQuantity(customUnit);
        if (listId) {
          const added = await listRepository.addItemToList(listId, {
            catalogItemId: null,
            itemNameSnapshot: name,
            quantity: defaultQty,
            unit: customUnit || 'pack',
            estimatedPrice: null,
            actualPrice: null,
            isPurchased: false,
            note: null,
          });
          if (onItemAdded) onItemAdded(added);
        } else {
          const customCatalogItem: CatalogItem = {
            id: `custom-${Date.now()}`,
            name: name,
            defaultUnit: customUnit || 'pack',
            categoryId: 'cat-misc',
            isCustom: true,
            createdAt: new Date().toISOString(),
          };
          await addDraftItem(customCatalogItem, defaultQty, customUnit || 'pack');
        }
      }
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to add custom item:', err);
    } finally {
      setIsAddingCustom(false);
    }
  };

  const handleOnlineProductAddToList = (product: OnlineBarcodeProduct) => {
    const tempItem: CatalogItem = {
      id: `online-item-${product.barcode}-${Date.now()}`,
      categoryId: product.categoryId,
      name: product.productName,
      defaultUnit: product.unit || 'pack',
      isCustom: true,
      barcode: product.barcode,
      brand: product.brand,
      imageUrl: product.imageUrl,
      createdAt: new Date().toISOString(),
    };
    handleAddCatalogItem(tempItem);
  };

  const handleOnlineProductAddToCatalog = async (product: OnlineBarcodeProduct) => {
    try {
      const savedItem = await catalogRepository.addOnlineCatalogItem(product);
      setAllItems((prev) => {
        if (prev.some((p) => p.id === savedItem.id || (p.barcode && p.barcode === savedItem.barcode))) {
          return prev;
        }
        return [...prev, savedItem];
      });
    } catch (err) {
      console.error('Failed to add online product to catalog:', err);
    }
  };

  const handleOnlineProductAddToListAndCatalog = async (product: OnlineBarcodeProduct) => {
    try {
      const savedItem = await catalogRepository.addOnlineCatalogItem(product);
      setAllItems((prev) => {
        if (prev.some((p) => p.id === savedItem.id || (p.barcode && p.barcode === savedItem.barcode))) {
          return prev;
        }
        return [...prev, savedItem];
      });
      await handleAddCatalogItem(savedItem);
    } catch (err) {
      console.error('Failed to add online product to list & catalog:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-modal-title"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col border border-gray-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-slate-900/50">
          <div>
            <h2 id="catalog-modal-title" className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              Add Items to Grocery List
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Browse 120+ Indian groceries or search by Hindi / local names
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close catalog picker"
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sticky Search Bar & Barcode Scanner Trigger */}
        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <label htmlFor="catalog-search-input" className="sr-only">
                Search grocery items by name or Hindi alias
              </label>
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="catalog-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items (e.g. Atta, Doodh, Basmati, Ghee, Pyaz)..."
                autoFocus
                aria-label="Search grocery items by name or Hindi alias"
                className="w-full pl-10 pr-9 py-2.5 bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowBarcodeScanner(true)}
              aria-label="Scan barcode or QR code"
              title="Scan barcode or QR code"
              className="px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl flex items-center space-x-1.5 text-xs font-bold shrink-0 transition-all cursor-pointer shadow-2xs active:scale-95 min-h-[44px]"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Scan</span>
            </button>
          </div>

          {/* Category Filter Pills */}
          <div role="tablist" aria-label="Catalog Categories" className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              role="tab"
              aria-selected={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              All Items ({allItems.length})
            </button>

            <button
              role="tab"
              aria-selected={selectedCategory === 'favorites'}
              onClick={() => setSelectedCategory('favorites')}
              className={`inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'favorites'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Favorites ({favorites.size})</span>
            </button>

            {categories.map((cat) => (
              <button
                key={cat.id}
                role="tab"
                aria-selected={selectedCategory === cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Catalog Items List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 divide-y divide-gray-100 dark:divide-slate-800">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-gray-500 dark:text-slate-400">
              Loading catalog items...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-10 text-center space-y-4">
              <Package className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-slate-200">
                  No catalog items found for &ldquo;{searchQuery.trim()}&rdquo;
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Item not in catalog? Add &ldquo;{searchQuery.trim()}&rdquo; directly to your list:
                </p>
              </div>

              {searchQuery.trim() && (
                <form
                  onSubmit={handleAddCustomItem}
                  className="flex items-center justify-center space-x-2 max-w-sm mx-auto"
                >
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    aria-label="Unit of measurement"
                    className="px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white cursor-pointer"
                  >
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    disabled={isAddingCustom}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isAddingCustom ? 'Adding...' : `+ Add "${searchQuery.trim()}"`}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* 6.4 "Suggested for You" Section */}
              {!searchQuery.trim() && selectedCategory === 'all' && suggestions.length > 0 && (
                <div className="mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center justify-between px-2 mb-2">
                    <div className="flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" aria-hidden="true" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-slate-300">
                        Suggested for You
                      </h3>
                    </div>
                    <span className="text-[11px] font-medium text-gray-400 dark:text-slate-500">
                      Based on shopping history
                    </span>
                  </div>

                  <div className="space-y-1">
                    {suggestions.map(({ item, isDue }) => {
                      const existing = existingItemsMap.get(item.id) || existingItemsMap.get(item.name.toLowerCase().trim());
                      const isAdded = Boolean(existing);

                      return (
                        <div
                          key={`sug-${item.id}`}
                          className="py-2.5 px-2 flex items-center justify-between hover:bg-amber-50/30 dark:hover:bg-slate-800/40 rounded-2xl transition-colors"
                        >
                          <div className="flex items-center space-x-3 min-w-0 pr-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/30">
                              {getCategoryIcon(item.categoryId)}
                            </div>

                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center space-x-1.5">
                                <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                                  {item.name}
                                </h4>
                                {isDue && (
                                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded-md border border-amber-200 dark:border-amber-800/60">
                                    Due
                                  </span>
                                )}
                              </div>

                              <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                                {item.defaultUnit}
                              </span>
                            </div>
                          </div>

                          {/* Stepper / Add button */}
                          <div className="shrink-0">
                            {isAdded && existing ? (
                              <div className="flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/70 p-1 rounded-xl border border-emerald-300 dark:border-emerald-700">
                                <button
                                  onClick={async () => {
                                    const newQty = decrementQuantity(existing.quantity, existing.unit);
                                    if (newQty <= 0) {
                                      if (listId) {
                                        await listRepository.removeListItem(existing.id);
                                      } else {
                                        await useDraftListStore.getState().removeItem(existing.id);
                                      }
                                    } else {
                                      if (listId) {
                                        await listRepository.updateListItem(existing.id, { quantity: newQty });
                                        if (onItemUpdated) onItemUpdated(existing.id, newQty);
                                      } else {
                                        await updateDraftQuantity(existing.id, newQty);
                                      }
                                    }
                                  }}
                                  aria-label={`Decrease quantity of ${item.name}`}
                                  className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer shadow-2xs font-bold text-xs"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>

                                <span className="px-1.5 text-xs font-black text-emerald-900 dark:text-emerald-100 min-w-[24px] text-center">
                                  {existing.quantity}
                                </span>

                                <button
                                  onClick={() => handleAddCatalogItem(item)}
                                  aria-label={`Increase quantity of ${item.name}`}
                                  className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 cursor-pointer shadow-2xs font-bold text-xs"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddCatalogItem(item)}
                                aria-label={`Add ${item.name} to grocery list`}
                                className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 7.8 "Complete Your List" Section */}
              {!searchQuery.trim() && selectedCategory === 'all' && currentItems.length > 0 && contextualCompletions.length > 0 && (
                <div className="mb-4 pb-3 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center justify-between px-2 mb-2">
                    <div className="flex items-center space-x-1.5">
                      <Package className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-slate-300">
                        Complete Your List
                      </h3>
                    </div>
                    <span className="text-[11px] font-medium text-gray-400 dark:text-slate-500">
                      Based on what you&apos;ve already added
                    </span>
                  </div>

                  <div className="space-y-1">
                    {contextualCompletions.map(({ item, isDue, matchedWith }) => {
                      const existing = existingItemsMap.get(item.id) || existingItemsMap.get(item.name.toLowerCase().trim());
                      const isAdded = Boolean(existing);

                      return (
                        <div
                          key={`comp-${item.id}`}
                          className="py-2.5 px-2 flex items-center justify-between hover:bg-emerald-50/40 dark:hover:bg-slate-800/40 rounded-2xl transition-colors"
                        >
                          <div className="flex items-center space-x-3 min-w-0 pr-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/30">
                              {getCategoryIcon(item.categoryId)}
                            </div>

                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center space-x-1.5">
                                <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                                  {item.name}
                                </h4>
                                {isDue && (
                                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded-md border border-amber-200 dark:border-amber-800/60">
                                    Due
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center space-x-2 flex-wrap">
                                <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                                  {item.defaultUnit}
                                </span>
                                {matchedWith && matchedWith.length > 0 && (
                                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                    • Pairs with {matchedWith.slice(0, 2).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Stepper / Add button */}
                          <div className="shrink-0">
                            {isAdded && existing ? (
                              <div className="flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/70 p-1 rounded-xl border border-emerald-300 dark:border-emerald-700">
                                <button
                                  onClick={async () => {
                                    const newQty = decrementQuantity(existing.quantity, existing.unit);
                                    if (newQty <= 0) {
                                      if (listId) {
                                        await listRepository.removeListItem(existing.id);
                                      } else {
                                        await useDraftListStore.getState().removeItem(existing.id);
                                      }
                                    } else {
                                      if (listId) {
                                        await listRepository.updateListItem(existing.id, { quantity: newQty });
                                        if (onItemUpdated) onItemUpdated(existing.id, newQty);
                                      } else {
                                        await updateDraftQuantity(existing.id, newQty);
                                      }
                                    }
                                  }}
                                  aria-label={`Decrease quantity of ${item.name}`}
                                  className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer shadow-2xs font-bold text-xs"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>

                                <span className="px-1.5 text-xs font-black text-emerald-900 dark:text-emerald-100 min-w-[24px] text-center">
                                  {existing.quantity}
                                </span>

                                <button
                                  onClick={() => handleAddCatalogItem(item)}
                                  aria-label={`Increase quantity of ${item.name}`}
                                  className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 cursor-pointer shadow-2xs font-bold text-xs"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddCatalogItem(item)}
                                aria-label={`Add ${item.name} to grocery list`}
                                className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredItems.length > MAX_VISIBLE_RESULTS && (
                <div className="py-2 px-3 mb-2 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl text-center text-xs font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/60">
                  Showing top {MAX_VISIBLE_RESULTS} of {filteredItems.length} results. Refine your search for specific items.
                </div>
              )}

              {visibleItems.map((item) => {
                const existing = existingItemsMap.get(item.id) || existingItemsMap.get(item.name.toLowerCase().trim());
                const isAdded = Boolean(existing);
                const isFav = favorites.has(item.id);
                const itemAliases = aliasMap.get(item.id) || [];
                const matchedAlias = searchQuery.trim() ? findMatchingAlias(itemAliases, searchQuery) : null;
                const nameHasQuery = searchQuery.trim() && item.name.toLowerCase().includes(searchQuery.trim().toLowerCase());

                return (
                  <div
                    key={item.id}
                    className="py-3 px-2 flex items-center justify-between hover:bg-gray-50/70 dark:hover:bg-slate-800/50 rounded-2xl transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
                        {getCategoryIcon(item.categoryId)}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                            <HighlightMatch text={item.name} query={searchQuery} />
                          </h4>
                          {isFav && !searchQuery.trim() && (
                            <Heart className="w-3 h-3 text-rose-500 fill-current shrink-0" aria-label="Favorite item" />
                          )}
                        </div>

                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 px-2 py-0.2 rounded-md">
                            {item.defaultUnit}
                          </span>

                          {matchedAlias && !nameHasQuery && (
                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 rounded-md border border-emerald-200/50 dark:border-emerald-800/50">
                              Matched: {matchedAlias}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Add / Quantity Stepper Button */}
                    <div className="shrink-0">
                      {isAdded && existing ? (
                        <div className="flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/70 p-1 rounded-xl border border-emerald-300 dark:border-emerald-700">
                          <button
                            onClick={async () => {
                              const newQty = decrementQuantity(existing.quantity, existing.unit);
                              if (newQty <= 0) {
                                if (listId) {
                                 await listRepository.removeListItem(existing.id);
                                } else {
                                  await useDraftListStore.getState().removeItem(existing.id);
                                }
                              } else {
                                if (listId) {
                                  await listRepository.updateListItem(existing.id, { quantity: newQty });
                                  if (onItemUpdated) onItemUpdated(existing.id, newQty);
                                } else {
                                  await updateDraftQuantity(existing.id, newQty);
                                }
                              }
                            }}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer shadow-2xs font-bold text-xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>

                          <span className="px-1.5 text-xs font-black text-emerald-900 dark:text-emerald-100 min-w-[24px] text-center">
                            {existing.quantity}
                          </span>

                          <button
                            onClick={() => handleAddCatalogItem(item)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 cursor-pointer shadow-2xs font-bold text-xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddCatalogItem(item)}
                          aria-label={`Add ${item.name} to grocery list`}
                          className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer Done Button */}
        <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-900/80 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
            {currentItems.length} item{currentItems.length !== 1 ? 's' : ''} in list
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all"
          >
            Done
          </button>
        </div>
      </div>

      {/* QR & Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        catalogItems={allItems}
        categories={categories}
        currentItems={currentItems}
        onItemResolved={(item) => {
          handleAddCatalogItem(item);
        }}
        onCustomItemRequested={(name) => {
          setSearchQuery(name);
        }}
        onSearchRequested={(query) => {
          setSearchQuery(query);
        }}
        onOnlineProductAddToList={handleOnlineProductAddToList}
        onOnlineProductAddToCatalog={handleOnlineProductAddToCatalog}
        onOnlineProductAddToListAndCatalog={handleOnlineProductAddToListAndCatalog}
      />
    </div>
  );
};
