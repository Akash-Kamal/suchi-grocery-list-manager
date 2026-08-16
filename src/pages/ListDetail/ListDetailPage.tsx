import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Share2, Play, CheckCircle2, Sparkles, Trash2, AlertTriangle, X, Info } from 'lucide-react';
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

  const fetchDetail = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listRepository.getListWithItems(listId);
      if (!data) {
        setError('List not found');
        setIsLoading(false);
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
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [listId]);

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

  /**
   * Initiates smart-repeat. If an active draft with items already exists,
   * shows a warning modal first rather than silently replacing it.
   */
  const handleSmartMergeRepeat = async () => {
    if (!list) return;

    // Check for an active draft with items
    const existingDraft = await listRepository.getCurrentDraft();
    if (existingDraft && existingDraft.items.length > 0) {
      setActiveDraftItemCount(existingDraft.items.length);
      setShowRepeatWarningModal(true);
      return;
    }

    await executeSmartRepeat();
  };

  /**
   * The actual merge logic. Called after the user confirms any warning.
   */
  const executeSmartRepeat = async () => {
    if (!list) return;
    setShowRepeatWarningModal(false);
    setIsSmartMerging(true);
    try {
      // forceNew=true: any existing draft is finalized before creating the new one
      const draft = await listRepository.createDraftList(
        `Grocery List (Repeated from ${list.listMonth})`,
        undefined,
        true
      );

      // Fetch recurring stats to apply median quantities instead of pure clone
      const stats = await historyRepository.getAllRecurringStats();
      const statsMap = new Map(stats.map((s) => [s.catalogItemId, s]));

      const newDraftItems: ListItem[] = [];
      const detectedAdjustments: QuantityAdjustment[] = [];

      for (const item of items) {
        const stat = item.catalogItemId ? statsMap.get(item.catalogItemId) : undefined;
        const suggestedQty = stat?.medianQuantity || item.quantity;
        const suggestedUnit = stat?.medianUnit || item.unit;

        // Check if quantity changed vs original
        if (suggestedQty !== item.quantity) {
          const flag = flagUnusualQuantity(item.quantity, suggestedQty);
          // Surface any adjustment (not just "unusual" — we show all changes for transparency)
          detectedAdjustments.push({
            itemName: item.itemNameSnapshot,
            originalQty: item.quantity,
            appliedQty: suggestedQty,
            unit: suggestedUnit,
          });
          void flag; // flag used for future extension (e.g. highlighting very large changes)
        }

        newDraftItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          listId: draft.list.id,
          catalogItemId: item.catalogItemId,
          itemNameSnapshot: item.itemNameSnapshot,
          quantity: suggestedQty,
          unit: suggestedUnit,
          estimatedPrice: item.estimatedPrice,
          actualPrice: null,
          isPurchased: false,
          note: item.note,
          sortOrder: newDraftItems.length + 1,
        });
      }

      await listRepository.saveDraftList(draft.list, newDraftItems);
      await loadDraftList();

      if (detectedAdjustments.length > 0) {
        setAdjustments(detectedAdjustments);
        setShowAdjustmentSummary(true);
        setPendingDraftNavigation(true);
        // Don't navigate yet — let user dismiss the summary first
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
    return <ErrorState message={error || 'List not found'} onRetry={fetchDetail} />;
  }

  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * i.quantity, 0);

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
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
          <button
            onClick={handleShareWhatsApp}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-xl cursor-pointer transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>WhatsApp Export</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isExportingPDF ? 'Generating...' : `Export PDF (${pdfSize})`}</span>
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
              Created on {new Date(list.createdAt).toLocaleDateString()}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSmartMergeRepeat}
              disabled={isSmartMerging}
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{isSmartMerging ? 'Merging...' : 'Smart-Repeat Month'}</span>
            </button>

            {onStartShopping && list.status !== 'completed' && (
              <button
                onClick={() => onStartShopping(list.id)}
                className="inline-flex items-center space-x-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow transition-all cursor-pointer"
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
            <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Purchased Items</span>
            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
              {items.filter((i) => i.isPurchased).length} / {items.length}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">Estimated Expenditure</span>
            <p className="text-lg font-black text-gray-900 dark:text-white">
              {estimatedTotal > 0 ? `₹${estimatedTotal.toLocaleString('en-IN')}` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* PDF Page Format Picker Options */}
      <div className="flex items-center space-x-3 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/60 text-xs font-bold text-emerald-900 dark:text-emerald-300">
        <span>PDF Page Layout Format:</span>
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

      {/* Items Read-Only List */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 pb-2">
          List Items Breakdown
        </h3>

        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {items.map((item) => (
            <div key={item.id} className="py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {item.isPurchased ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-slate-600 shrink-0" />
                )}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">{item.itemNameSnapshot}</h4>
                  {item.note && <p className="text-xs text-gray-500 dark:text-slate-400 italic">{item.note}</p>}
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-black text-gray-900 dark:text-white bg-gray-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {item.quantity} {item.unit}
                </span>
                {item.estimatedPrice && (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                    ₹{(item.estimatedPrice * item.quantity).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Smart-Repeat: Warning Modal when active draft has items */}
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
              Smart-Repeat will <strong className="text-amber-700 dark:text-amber-400">finalize the current draft</strong> (it will be saved to History) and create a new draft based on this list with historical median quantities. Your current draft items will not be lost.
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

      {/* Phase 3: Quantity Adjustment Summary Modal */}
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
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer"
              >
                Got It — Review Draft →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Grocery List?</h3>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-gray-900 dark:text-white">"{list.title}"</strong>? This action cannot be undone.
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
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-all disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete List'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
