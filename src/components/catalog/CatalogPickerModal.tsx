import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { catalogRepository } from '../../repositories/catalogRepository';
import { listRepository } from '../../repositories/listRepository';
import { useDraftListStore } from '../../stores/useDraftListStore';
import type { CatalogItem, Category, ListItem } from '../../types/database';

export interface CatalogPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  listId?: string; // Optional: If provided, adds to this specific list (History or Shopping). If omitted, adds to active draft.
  currentItems: ListItem[];
  onItemAdded?: (item: ListItem) => void;
  onItemUpdated?: (itemId: string, newQty: number) => void;
}

const COMMON_UNITS: string[] = ['kg', 'g', 'L', 'ml', 'pack', 'pcs', 'bottle', 'dozen'];

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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customUnit, setCustomUnit] = useState<string>('pack');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  // Fallback for draft list store if listId is not supplied
  const { addItem: addDraftItem, updateItemQuantity: updateDraftQuantity } = useDraftListStore();

  // Create a map of catalogItemId/itemNameSnapshot -> ListItem for quick duplicate detection & quantity display
  const existingItemsMap = useMemo(() => {
    const map = new Map<string, ListItem>();
    for (const item of currentItems) {
      if (item.catalogItemId) {
        map.set(item.catalogItemId, item);
      }
      // Also map by lowercased snapshot name
      map.set(item.itemNameSnapshot.toLowerCase().trim(), item);
    }
    return map;
  }, [currentItems]);

  // Load catalog items, categories, and favorites once when modal opens
  const loadCatalogData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cats, items, favs] = await Promise.all([
        catalogRepository.getCategories(),
        catalogRepository.getCatalogItems(),
        catalogRepository.getFavorites(),
      ]);
      setCategories(cats);
      setAllItems(items);
      setFavorites(new Set(favs.map((f) => f.catalogItemId)));
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

  // Local in-memory filtering (super fast, no async overhead per keystroke)
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = allItems;

    // Filter by category
    if (selectedCategory === 'favorites') {
      list = list.filter((item) => favorites.has(item.id));
    } else if (selectedCategory !== 'all') {
      list = list.filter((item) => item.categoryId === selectedCategory);
    }

    if (!q) return list;

    return list.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(q);
      return nameMatch;
    });
  }, [allItems, searchQuery, selectedCategory, favorites]);

  // Handle Add / Increment Item
  const handleAddCatalogItem = async (catalogItem: CatalogItem) => {
    const existing = existingItemsMap.get(catalogItem.id) || existingItemsMap.get(catalogItem.name.toLowerCase().trim());

    if (existing) {
      // Duplicate item found: increment quantity by 1
      const newQty = existing.quantity + (catalogItem.defaultUnit === 'g' || catalogItem.defaultUnit === 'ml' ? 100 : 1);
      if (listId) {
        await listRepository.updateListItem(existing.id, { quantity: newQty });
        if (onItemUpdated) onItemUpdated(existing.id, newQty);
      } else {
        await updateDraftQuantity(existing.id, newQty);
      }
      return;
    }

    // New item: create and add
    const defaultQty = catalogItem.defaultUnit === 'g' || catalogItem.defaultUnit === 'ml' ? 500 : 1;

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
  };

  // Handle Quick Custom Item Add (if search query doesn't match standard items)
  const handleAddCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = searchQuery.trim();
    if (!name) return;

    setIsAddingCustom(true);
    try {
      const existing = existingItemsMap.get(name.toLowerCase());
      if (existing) {
        const newQty = existing.quantity + 1;
        if (listId) {
          await listRepository.updateListItem(existing.id, { quantity: newQty });
          if (onItemUpdated) onItemUpdated(existing.id, newQty);
        } else {
          await updateDraftQuantity(existing.id, newQty);
        }
      } else {
        if (listId) {
          const added = await listRepository.addItemToList(listId, {
            catalogItemId: null,
            itemNameSnapshot: name,
            quantity: 1,
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
          await addDraftItem(customCatalogItem, 1, customUnit || 'pack');
        }
      }
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to add custom item:', err);
    } finally {
      setIsAddingCustom(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col border border-gray-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-slate-900/50">
          <div>
            <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
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

        {/* Sticky Search Bar */}
        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items (e.g. Atta, Doodh, Basmati, Ghee, Pyaz)..."
              autoFocus
              className="w-full pl-10 pr-9 py-2.5 bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer p-0.5"
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
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              All Items ({allItems.length})
            </button>

            <button
              onClick={() => setSelectedCategory('favorites')}
              className={`inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'favorites'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span>Favorites ({favorites.size})</span>
            </button>

            {categories.map((cat) => (
              <button
                key={cat.id}
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
              <Package className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-slate-200">
                  No catalog items found for &ldquo;{searchQuery}&rdquo;
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Add it directly as a custom item below:
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
                    className="px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white"
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
            filteredItems.map((item) => {
              const existing = existingItemsMap.get(item.id) || existingItemsMap.get(item.name.toLowerCase().trim());
              const isAdded = Boolean(existing);

              return (
                <div
                  key={item.id}
                  className="py-3 px-2 flex items-center justify-between hover:bg-gray-50/70 dark:hover:bg-slate-800/50 rounded-2xl transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
                      {getCategoryIcon(item.categoryId)}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                        {item.name}
                      </h4>
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                        {item.defaultUnit}
                      </span>
                    </div>
                  </div>

                  {/* Add / Quantity Stepper Button */}
                  <div className="shrink-0">
                    {isAdded && existing ? (
                      <div className="flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/70 p-1 rounded-xl border border-emerald-300 dark:border-emerald-700">
                        <button
                          onClick={async () => {
                            const newQty = existing.quantity - (existing.unit === 'g' || existing.unit === 'ml' ? 100 : 1);
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
                          aria-label="Decrease quantity"
                          className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer shadow-2xs font-bold text-xs"
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <span className="px-1.5 text-xs font-black text-emerald-900 dark:text-emerald-100 min-w-[24px] text-center">
                          {existing.quantity}
                        </span>

                        <button
                          onClick={() => handleAddCatalogItem(item)}
                          aria-label="Increase quantity"
                          className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 cursor-pointer shadow-2xs font-bold text-xs"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddCatalogItem(item)}
                        className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
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
    </div>
  );
};
