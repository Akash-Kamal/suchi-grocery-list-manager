import React, { useEffect, useState, useCallback } from 'react';
import { ShoppingBag, ArrowRight, PlusCircle, AlertTriangle, Sparkles, History as HistoryIcon, Trash2, X, Clock, Users, UserPlus, Camera } from 'lucide-react';
import { useDraftListStore } from '../../stores/useDraftListStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { historyRepository } from '../../repositories/historyRepository';
import { catalogRepository } from '../../repositories/catalogRepository';
import { isDraftStale } from '../../repositories/listRepository';
import { detectGaps, type GapSuggestion } from '../../services/suggestionEngine';
import type { CatalogItem, Category, GroceryList } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { HouseholdHeader } from '../../components/ui/HouseholdHeader';
import { LiveSyncBadge } from '../../components/ui/LiveSyncBadge';
import { HouseholdMembersModal } from '../../components/ui/HouseholdMembersModal';
import { BarcodeScannerModal, type ManualCustomProductInput } from '../../components/catalog/BarcodeScannerModal';
import type { OnlineBarcodeProduct } from '../../services/barcodeProductLookup';

interface HomePageProps {
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
  onOpenHouseholdSetup?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onOpenHouseholdSetup }) => {
  const { currentList, items, isLoading, error, loadDraftList, addItem, addCustomItem, applyGapSuggestion, clearDraft } = useDraftListStore();
  const { user, household, membership, members } = useAuthStore();
  const [pastLists, setPastLists] = useState<GroceryList[]>([]);
  const [gaps, setGaps] = useState<GapSuggestion[]>([]);
  const [isHomeLoading, setIsHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [showMembersModal, setShowMembersModal] = useState<boolean>(false);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [catalogList, setCatalogList] = useState<CatalogItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);

  // Custom Delete Draft Modal
  const [showDeleteDraftModal, setShowDeleteDraftModal] = useState<boolean>(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState<boolean>(false);

  const isOwner = membership?.role === 'owner';
  const ownerMember = members.find((m) => m.role === 'owner');
  const ownerDisplayName = isOwner
    ? 'You'
    : (ownerMember as any)?.name || (ownerMember?.email ? ownerMember.email.split('@')[0] : 'Household Owner');

  const fetchData = useCallback(async () => {
    setIsHomeLoading(true);
    setHomeError(null);
    try {
      await loadDraftList();
      const currentItems = useDraftListStore.getState().items;
      const recent = await historyRepository.getPastLists(4);
      setPastLists(recent);

      const cats = await catalogRepository.getCategories();
      setCategoriesList(cats);

      // Compute gaps from recurring stats
      const recurringStats = await historyRepository.getAllRecurringStats();
      const catalogItems = await catalogRepository.getCatalogItems();
      setCatalogList(catalogItems);
      const catalogMap = new Map(catalogItems.map((c) => [c.id, c]));

      const draftItemIds = new Set(currentItems.map((i) => i.catalogItemId).filter((id): id is string => Boolean(id)));

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
  }, [loadDraftList]);

  useEffect(() => {
    fetchData();
  }, [fetchData, household?.id]);

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

  // Barcode Scanner Handlers for Home Page
  const handleItemResolved = async (item: CatalogItem) => {
    await addItem(item);
    await fetchData();
  };

  const handleOnlineProductAddToList = async (product: OnlineBarcodeProduct) => {
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
    await addItem(tempItem, product.quantity, product.unit);
    await fetchData();
  };

  const handleOnlineProductAddToCatalog = async (product: OnlineBarcodeProduct) => {
    const saved = await catalogRepository.addOnlineCatalogItem(product);
    setCatalogList((prev) => {
      if (prev.some((p) => p.id === saved.id || (p.barcode && p.barcode === saved.barcode))) return prev;
      return [...prev, saved];
    });
  };

  const handleOnlineProductAddToListAndCatalog = async (product: OnlineBarcodeProduct) => {
    const saved = await catalogRepository.addOnlineCatalogItem(product);
    setCatalogList((prev) => {
      if (prev.some((p) => p.id === saved.id || (p.barcode && p.barcode === saved.barcode))) return prev;
      return [...prev, saved];
    });
    await addItem(saved, product.quantity, product.unit);
    await fetchData();
  };

  const handleManualCustomProductSave = async (input: ManualCustomProductInput) => {
    if (input.action === 'catalog' || input.action === 'both') {
      const saved = await catalogRepository.addOnlineCatalogItem({
        barcode: input.barcode,
        productName: input.name,
        brand: input.brand,
        categoryId: input.categoryId,
        unit: input.unit,
      });
      setCatalogList((prev) => {
        if (prev.some((p) => p.id === saved.id || (p.barcode && p.barcode === saved.barcode))) return prev;
        return [...prev, saved];
      });
      if (input.action === 'both') {
        await addItem(saved, input.quantity, input.unit);
      }
    } else if (input.action === 'list') {
      await addCustomItem(input.name, input.categoryId, input.quantity, input.unit);
    }
    await fetchData();
  };

  if (isLoading || isHomeLoading) {
    return <LoadingState message="Preparing your grocery overview..." />;
  }

  if (error || homeError) {
    return <ErrorState message={error || homeError || 'An error occurred'} onRetry={fetchData} />;
  }

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * i.quantity, 0);

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* ── Household Top Context Banner (When Active) ── */}
      {household && (
        <HouseholdHeader
          onNavigate={onNavigate}
          onOpenInvite={onOpenHouseholdSetup}
        />
      )}

      {/* Header Banner (When No Household) */}
      {!household && (
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-emerald-700/50">
          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center space-x-2 bg-emerald-950/60 backdrop-blur-md border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold text-emerald-200 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-spin" />
              <span>Smart Suggestion Engine Active</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-white">
              {userName ? `Namaste, ${userName}!` : 'Namaste!'} Ready for this month's grocery list?
            </h1>
            <p className="text-emerald-100 text-sm md:text-base font-normal leading-relaxed opacity-95">
              SOOCHI learns your recurring purchases to pre-fill draft lists and warn you before you forget household staples.
            </p>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-4 translate-y-4">
            <ShoppingBag className="w-64 h-64 text-white" />
          </div>
        </div>
      )}

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

      {/* ── Active Grocery List Card (Shared or Personal) ── */}
      <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 md:p-7 border border-emerald-100 dark:border-slate-800 shadow-sm dark:shadow-black/40 hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-100 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              {household ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-black uppercase tracking-wider">
                  <span>🏠</span>
                  <span>Shared Household List</span>
                </span>
              ) : (
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
                  Active Draft List
                </span>
              )}

              {household && <LiveSyncBadge compact />}
            </div>

            <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">
              {currentList?.title || 'Current Monthly Grocery'}
            </h2>

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 flex items-center space-x-2">
              <span>Month: {currentList?.listMonth || new Date().toISOString().substring(0, 7)}</span>
              {household && (
                <>
                  <span>•</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    {household.name} ({isOwner ? '👑 Owner' : `Shared by ${ownerDisplayName}`})
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowScanner(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 sm:px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-xs transition-all cursor-pointer min-h-[44px]"
              aria-label="Scan Barcode"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden xs:inline sm:inline">Scan Barcode</span>
              <span className="inline xs:hidden sm:hidden">Scan</span>
            </button>
            <button
              onClick={() => onNavigate('/catalog')}
              className="inline-flex items-center space-x-1.5 px-3.5 sm:px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold text-sm rounded-xl transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800 min-h-[44px]"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Items</span>
            </button>
            <button
              onClick={() => onNavigate('/review')}
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-md transition-all cursor-pointer min-h-[44px]"
            >
              <span>Review ({items.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            {items.length > 0 && (
              <button
                onClick={() => setShowDeleteDraftModal(true)}
                title="Delete active draft list"
                aria-label="Delete active draft list"
                className="p-2.5 text-gray-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-gray-200 dark:border-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-8 text-center bg-gray-50/50 dark:bg-slate-800/50 rounded-2xl my-4 border border-dashed border-gray-200 dark:border-slate-700">
            <ShoppingBag className="w-10 h-10 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              {household ? 'Shared draft list is currently empty' : 'Your draft list is currently empty'}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Browse the starter catalog or scan product barcodes to add items with 1-tap quantity controls.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
              <button
                onClick={() => onNavigate('/catalog')}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow cursor-pointer min-h-[44px]"
              >
                Explore Starter Catalog
              </button>
              <button
                onClick={() => setShowScanner(true)}
                className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-semibold text-xs rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5 min-h-[44px]"
              >
                <Camera className="w-4 h-4" />
                <span>Scan Barcode</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div className="p-3.5 bg-emerald-50/70 dark:bg-slate-800/80 rounded-2xl border border-emerald-100 dark:border-slate-700">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Distinct Items</span>
              <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">{items.length}</p>
            </div>
            <div className="p-3.5 bg-emerald-50/70 dark:bg-slate-800/80 rounded-2xl border border-emerald-100 dark:border-slate-700">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Total Items Qty</span>
              <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">{itemCount}</p>
            </div>
            <div className="p-3.5 bg-emerald-50/70 dark:bg-slate-800/80 rounded-2xl border border-emerald-100 dark:border-slate-700 col-span-2">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Estimated Budget</span>
              <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">
                {estimatedTotal > 0 ? `₹${estimatedTotal.toLocaleString('en-IN')}` : 'Not set'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── No Shared Household Promotional Section ── */}
      {!household && (
        <div className="bg-gradient-to-r from-emerald-900/10 via-teal-900/10 to-slate-900/10 dark:from-emerald-950/40 dark:to-slate-900/60 rounded-3xl p-6 border border-emerald-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400">
              <Users className="w-5 h-5" />
              <h3 className="text-base font-black text-gray-900 dark:text-white">Shared Family Grocery Lists</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-slate-300 max-w-md leading-relaxed">
              Plan groceries together with your family. Join an existing household via an invite link or create one to share lists live.
            </p>
          </div>

          <button
            onClick={onOpenHouseholdSetup}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all flex items-center space-x-2 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Join or Create Household</span>
          </button>
        </div>
      )}

      {/* Gap Detection Warnings Widget */}
      {gaps.length > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-950/40 rounded-3xl p-5 md:p-6 border border-amber-200 dark:border-amber-900/60 shadow-sm">
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
              <div key={gap.catalogItemId} className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 shadow-sm flex flex-col justify-between">
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
                  className="mt-3 w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  + Add {gap.suggestedQuantity} {gap.defaultUnit}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent History Strip */}
      <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm">
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
                className="p-4 rounded-2xl border border-gray-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer bg-gray-50/50 dark:bg-slate-800/50 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">{list.listMonth}</span>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 capitalize">
                      {list.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{list.title}</h4>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2">
                  Created {new Date(list.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Members Modal */}
      <HouseholdMembersModal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        onOpenInvite={onOpenHouseholdSetup}
      />

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

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        catalogItems={catalogList}
        categories={categoriesList}
        currentItems={items}
        onItemResolved={handleItemResolved}
        onOnlineProductAddToList={handleOnlineProductAddToList}
        onOnlineProductAddToCatalog={handleOnlineProductAddToCatalog}
        onOnlineProductAddToListAndCatalog={handleOnlineProductAddToListAndCatalog}
        onManualCustomProductSave={handleManualCustomProductSave}
        onSearchRequested={() => {
          onNavigate('/catalog');
        }}
        onCustomItemRequested={() => {
          onNavigate('/catalog');
        }}
      />
    </div>
  );
};
