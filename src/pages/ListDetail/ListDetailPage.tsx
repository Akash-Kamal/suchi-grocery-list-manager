import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  FileText,
  Share2,
  Play,
  Sparkles,
  Trash2,
  AlertTriangle,
  X,
  Info,
  Plus,
  Minus,
  Check,
} from 'lucide-react';
import { listRepository } from '../../repositories/listRepository';
import { catalogRepository } from '../../repositories/catalogRepository';
import { historyRepository } from '../../repositories/historyRepository';
import { downloadGroceryPDF, type PageSizeFormat } from '../../utils/pdfExporter';
import { shareToWhatsApp } from '../../utils/whatsappExporter';
import { useDraftListStore } from '../../stores/useDraftListStore';
import { flagUnusualQuantity } from '../../services/suggestionEngine';
import type { Category, GroceryList, ListItem } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { HouseholdHeader } from '../../components/ui/HouseholdHeader';
import { CatalogPickerModal } from '../../components/catalog/CatalogPickerModal';
import { useAuthStore } from '../../stores/useAuthStore';

interface ListDetailPageProps {
  listId: string;
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
  onStartShopping?: (listId: string) => void;
}

interface QuantityAdjustment {
  itemName: string;
  originalQty: number;
  appliedQty: number;
  unit: string;
}

const COMMON_UNITS: string[] = ['kg', 'g', 'L', 'ml', 'pack', 'pcs', 'bottle', 'dozen'];

export const ListDetailPage: React.FC<ListDetailPageProps> = ({
  listId,
  onNavigate,
  onStartShopping,
}) => {
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState<PageSizeFormat>('A4');
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [isSmartMerging, setIsSmartMerging] = useState<boolean>(false);

  // Complete Catalog Picker Modal State
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);

  // Custom Delete Confirmation Modal State
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Smart-Repeat: warn when active draft already has items
  const [showRepeatWarningModal, setShowRepeatWarningModal] = useState<boolean>(false);
  const [activeDraftItemCount, setActiveDraftItemCount] = useState<number>(0);

  // Smart-Repeat: quantity adjustment summary shown after merge
  const [adjustments, setAdjustments] = useState<QuantityAdjustment[]>([]);
  const [showAdjustmentSummary, setShowAdjustmentSummary] = useState<boolean>(false);
  const [pendingDraftNavigation, setPendingDraftNavigation] = useState<boolean>(false);

  const { loadDraftList } = useDraftListStore();
  const household = useAuthStore((state) => state.household);

  const fetchDetail = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const data = await listRepository.getListWithItems(listId);
      if (!data) {
        setError('List not found');
        if (showLoading) setIsLoading(false);
        return;
      }
      setList(data.list);
      setItems(data.items);
      const cats = await catalogRepository.getCategories();
      setCategories(cats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load list details';
      setError(msg);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    fetchDetail(true);

    // Subscribe to realtime item and list events
    const handleRealtimeChange = (e: Event) => {
      const customEv = e as CustomEvent;
      if (!customEv.detail || customEv.detail.listId === listId || customEv.detail.eventType === 'DELETE') {
        fetchDetail(false);
      }
    };

    window.addEventListener('suchi:list_item_changed', handleRealtimeChange);
    window.addEventListener('suchi:list_changed', handleRealtimeChange);

    return () => {
      window.removeEventListener('suchi:list_item_changed', handleRealtimeChange);
      window.removeEventListener('suchi:list_changed', handleRealtimeChange);
    };
  }, [fetchDetail, listId]);

  // Item Modification Handlers (Syncs to Supabase in Realtime)
  const handleTogglePurchased = async (itemId: string, currentPurchased: boolean) => {
    const nextPurchased = !currentPurchased;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, isPurchased: nextPurchased } : i))
    );
    await listRepository.updateListItem(itemId, { isPurchased: nextPurchased });
  };

  const handleUpdateQuantity = async (itemId: string, newQty: number) => {
    if (newQty <= 0) return;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i))
    );
    await listRepository.updateListItem(itemId, { quantity: newQty });
  };

  const handleUpdateUnit = async (itemId: string, newUnit: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, unit: newUnit } : i))
    );
    await listRepository.updateListItem(itemId, { unit: newUnit });
  };

  const handleDeleteItem = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    await listRepository.removeListItem(itemId);
  };

  const handleExportPDF = async () => {
    if (!list || items.length === 0) return;
    setIsExportingPDF(true);
    try {
      await downloadGroceryPDF(list, items, categories, pdfSize);
    } catch (err) {
      console.error('PDF Export failed:', err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!list || items.length === 0) return;
    shareToWhatsApp(list, items, categories);
  };

  const handleSmartMergeRepeat = async () => {
    if (!list) return;

    const existingDraft = await listRepository.getCurrentDraft();
    if (existingDraft && existingDraft.items.length > 0) {
      setActiveDraftItemCount(existingDraft.items.length);
      setShowRepeatWarningModal(true);
      return;
    }

    await executeSmartRepeat();
  };

  const executeSmartRepeat = async () => {
    if (!list) return;
    setShowRepeatWarningModal(false);
    setIsSmartMerging(true);
    try {
      await listRepository.createDraftList(
        `Grocery List (Repeated from ${list.listMonth})`,
        undefined,
        true
      );

      const stats = await historyRepository.getAllRecurringStats();
      const statsMap = new Map(stats.map((s) => [s.catalogItemId, s]));

      const detectedAdjustments: QuantityAdjustment[] = [];

      for (const item of items) {
        const stat = item.catalogItemId ? statsMap.get(item.catalogItemId) : undefined;
        const suggestedQty = stat?.medianQuantity || item.quantity;
        const suggestedUnit = stat?.medianUnit || item.unit;

        if (suggestedQty !== item.quantity) {
          flagUnusualQuantity(item.quantity, suggestedQty);
          detectedAdjustments.push({
            itemName: item.itemNameSnapshot,
            originalQty: item.quantity,
            appliedQty: suggestedQty,
            unit: suggestedUnit,
          });
        }
      }

      await loadDraftList();

      if (detectedAdjustments.length > 0) {
        setAdjustments(detectedAdjustments);
        setShowAdjustmentSummary(true);
        setPendingDraftNavigation(true);
      } else {
        onNavigate('/review');
      }
    } catch (err) {
      console.error('Smart merge failed:', err);
    } finally {
      setIsSmartMerging(false);
    }
  };

  const confirmDeleteList = async () => {
    if (!list) return;
    setIsDeleting(true);
    try {
      await listRepository.deleteList(list.id);
      await loadDraftList();
      onNavigate('/history');
    } catch (err) {
      console.error('Failed to delete list:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading list details..." />;
  }

  if (error || !list) {
    return <ErrorState message={error || 'List not found'} onRetry={() => fetchDetail(true)} />;
  }

  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * i.quantity, 0);
  const purchasedCount = items.filter((i) => i.isPurchased).length;
  const progressPercent = items.length > 0 ? Math.round((purchasedCount / items.length) * 100) : 0;

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Household Header (when active) */}
      {household && <HouseholdHeader compact onNavigate={onNavigate} />}

      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate('/history')}
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-emerald-700 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to History</span>
        </button>

        <div className="flex items-center space-x-2">
          {household && (
            <span className="hidden sm:inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE Collaborative List</span>
            </span>
          )}

          <button
            onClick={handleShareWhatsApp}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-xl cursor-pointer transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isExportingPDF ? 'Generating...' : `PDF`}</span>
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            title="Delete this list"
            aria-label="Delete this list"
            className="p-2 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Header Info Card */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 capitalize">
                {list.status}
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Month: {list.listMonth}</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">{list.title}</h1>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              {household ? `Shared Household Grocery List • Created ${new Date(list.createdAt).toLocaleDateString()}` : `Created on ${new Date(list.createdAt).toLocaleDateString()}`}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSmartMergeRepeat}
              disabled={isSmartMerging}
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{isSmartMerging ? 'Merging...' : 'Smart-Repeat'}</span>
            </button>

            {onStartShopping && (
              <button
                onClick={() => onStartShopping(list.id)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Shopping Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50/70 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-700">
          <div>
            <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Total Items</span>
            <p className="text-lg font-black text-gray-900 dark:text-white">{items.length} items</p>
          </div>
          <div>
            <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Shopping Progress</span>
            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
              {purchasedCount} / {items.length} ({progressPercent}%)
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Estimated Value</span>
            <p className="text-lg font-black text-gray-900 dark:text-white">
              {estimatedTotal > 0 ? `₹${estimatedTotal.toLocaleString('en-IN')}` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* PDF Page Format Picker Options */}
      <div className="flex items-center justify-between bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/60 text-xs font-bold text-emerald-900 dark:text-emerald-300">
        <div className="flex items-center space-x-2">
          <span>PDF Format:</span>
          <button
            onClick={() => setPdfSize('A4')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
              pdfSize === 'A4' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            }`}
          >
            A4 Standard
          </button>
          <button
            onClick={() => setPdfSize('A5')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
              pdfSize === 'A5' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            }`}
          >
            A5 Compact
          </button>
        </div>

        <button
          onClick={() => setShowCatalogModal(true)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Items</span>
        </button>
      </div>

      {/* Interactive & Editable Items List */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
            Grocery Items ({items.length})
          </h3>
          <span className="text-[11px] text-gray-400 dark:text-slate-500">
            Click items to edit quantities, units, and status
          </span>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 dark:bg-slate-800/40 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-slate-400">No items in this list yet.</p>
            <button
              onClick={() => setShowCatalogModal(true)}
              className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              + Add First Item
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {items.map((item) => {
              const isChecked = item.isPurchased;

              return (
                <div
                  key={item.id}
                  className={`py-3 px-2 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isChecked
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200'
                      : 'hover:bg-gray-50/80 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    {/* Toggle Purchased Checkbox */}
                    <button
                      onClick={() => handleTogglePurchased(item.id, isChecked)}
                      aria-label={`${isChecked ? 'Unmark' : 'Mark'} ${item.itemNameSnapshot}`}
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-600 text-white shadow-xs scale-105'
                          : 'border-2 border-gray-300 dark:border-slate-600 text-transparent hover:border-emerald-500'
                      }`}
                    >
                      <Check className={`w-3.5 h-3.5 ${isChecked ? 'stroke-[3]' : ''}`} />
                    </button>

                    <div className="min-w-0">
                      <h4
                        className={`text-sm font-bold truncate transition-colors ${
                          isChecked ? 'line-through text-gray-500 dark:text-slate-400' : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {item.itemNameSnapshot}
                      </h4>
                      {item.note && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 italic truncate">{item.note}</p>
                      )}
                    </div>
                  </div>

                  {/* Quantity Stepper & Unit Selector */}
                  <div className="flex items-center space-x-3 self-end sm:self-auto shrink-0">
                    <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-xl p-1 border border-gray-200 dark:border-slate-700">
                      <button
                        onClick={() => handleUpdateQuantity(item.id, Math.max(0.5, item.quantity - (item.unit === 'g' || item.unit === 'ml' ? 50 : 1)))}
                        aria-label="Decrease quantity"
                        className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-600 cursor-pointer shadow-2xs text-xs font-bold"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <span className="px-2.5 text-xs font-black text-gray-900 dark:text-white min-w-[28px] text-center">
                        {item.quantity}
                      </span>

                      <button
                        onClick={() => handleUpdateQuantity(item.id, item.quantity + (item.unit === 'g' || item.unit === 'ml' ? 50 : 1))}
                        aria-label="Increase quantity"
                        className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-600 cursor-pointer shadow-2xs text-xs font-bold"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <select
                      value={item.unit}
                      onChange={(e) => handleUpdateUnit(item.id, e.target.value)}
                      aria-label="Change unit"
                      className="px-2 py-1 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      title="Delete item"
                      aria-label={`Delete ${item.itemNameSnapshot}`}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete List Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800">
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete List?</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-slate-300">
              Are you sure you want to permanently delete <strong>{list.title}</strong>? This cannot be undone.
            </p>
            <div className="pt-2 flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteList}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart-Repeat Warning Modal */}
      {showRepeatWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Replace Active Draft?</h3>
              </div>
              <button onClick={() => setShowRepeatWarningModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              You have an active draft with <strong className="text-gray-900 dark:text-white">{activeDraftItemCount} item{activeDraftItemCount !== 1 ? 's' : ''}</strong> already in it.
            </p>
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Smart-Repeat will finalize the current draft and create a new draft based on this list.
            </p>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                onClick={() => setShowRepeatWarningModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Keep Current Draft
              </button>
              <button
                onClick={executeSmartRepeat}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all"
              >
                Yes, Smart-Repeat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quantity Adjustment Summary Modal */}
      {showAdjustmentSummary && adjustments.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                <Info className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Quantity Adjustments Applied</h3>
              </div>
              <button
                onClick={() => {
                  setShowAdjustmentSummary(false);
                  if (pendingDraftNavigation) onNavigate('/review');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400">
              These quantities were adjusted to match your historical purchase medians:
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {adjustments.map((adj, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-100 dark:border-amber-900/60 text-xs">
                  <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[160px]">{adj.itemName}</span>
                  <span className="font-black text-amber-700 dark:text-amber-300 shrink-0">
                    {adj.originalQty} → {adj.appliedQty} {adj.unit}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  setShowAdjustmentSummary(false);
                  if (pendingDraftNavigation) onNavigate('/review');
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer"
              >
                Review New Draft List →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Catalog Picker Modal */}
      <CatalogPickerModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        listId={list.id}
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
