import React, { useEffect, useState } from 'react';
import { History as HistoryIcon, Calendar, ArrowRight, Trash2, AlertTriangle, X } from 'lucide-react';
import { listRepository } from '../../repositories/listRepository';
import { historyRepository } from '../../repositories/historyRepository';
import type { GroceryList } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { HouseholdHeader } from '../../components/ui/HouseholdHeader';
import { useAuthStore } from '../../stores/useAuthStore';

interface HistoryPageProps {
  onNavigate: (path: '/' | '/catalog' | '/review' | '/history' | '/settings') => void;
  onSelectList?: (listId: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigate, onSelectList }) => {
  const { household } = useAuthStore();
  const [pastLists, setPastLists] = useState<GroceryList[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Custom Delete Confirmation Modal State
  const [listToDelete, setListToDelete] = useState<GroceryList | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const lists = await historyRepository.getPastLists(50);
      setPastLists(lists);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load past history';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [household?.id]);

  const confirmDelete = async () => {
    if (!listToDelete) return;
    setIsDeleting(true);
    try {
      await listRepository.deleteList(listToDelete.id);
      setPastLists((prev) => prev.filter((l) => l.id !== listToDelete.id));
      setListToDelete(null);
    } catch (err) {
      console.error('Failed to delete list:', err);
      setError('Failed to delete list. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Fetching monthly purchase history..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchHistory} />;
  }

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      {/* Household Header (when active) */}
      {household && <HouseholdHeader compact onNavigate={onNavigate} />}

      <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-emerald-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-2 mb-1">
          <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">
            {household ? 'Shared Household Grocery Lists & History' : 'Monthly Grocery Lists & History'}
          </h1>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {household
            ? `Review, edit, export PDFs, share via WhatsApp, or repeat past monthly lists from ${household.name}.`
            : 'Review, edit, delete, export PDFs, share via WhatsApp, or repeat past monthly lists.'}
        </p>
      </div>

      {pastLists.length === 0 ? (
        <EmptyState
          title="No saved grocery lists yet"
          description="Finalize a grocery list to view and manage monthly purchase history here."
          icon={HistoryIcon}
          actionLabel="Go to Catalog & Start List"
          onAction={() => onNavigate('/catalog')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pastLists.map((list) => (
            <div
              key={list.id}
              onClick={() => onSelectList && onSelectList(list.id)}
              className="bg-white dark:bg-slate-900/90 rounded-2xl p-5 border border-gray-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group relative"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="inline-flex items-center space-x-1 text-xs font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{list.listMonth}</span>
                    </span>
                    {household && (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        🏠 Shared
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full capitalize ${
                        list.status === 'completed'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : list.status === 'finalized'
                          ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {list.status}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setListToDelete(list);
                      }}
                      title="Delete List"
                      aria-label={`Delete list ${list.title}`}
                      className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-snug">{list.title}</h3>
                <p className="text-xs text-gray-400 dark:text-slate-400 mt-2">
                  Saved on {new Date(list.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center space-x-1">
                  <span>View Details & Actions</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] text-gray-400 dark:text-slate-500 font-semibold">Tap to open</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {listToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-100 dark:border-slate-800 animate-scale-up">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Grocery List?</h3>
              </div>
              <button
                onClick={() => setListToDelete(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-gray-900 dark:text-white">"{listToDelete.title}"</strong>? All items in this list will be removed from your local storage.
            </p>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                onClick={() => setListToDelete(null)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
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
