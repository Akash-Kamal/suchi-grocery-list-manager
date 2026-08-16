import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { localDataMigrator } from '../../services/localDataMigrator';
import { useAuthStore } from '../../stores/useAuthStore';

interface LocalDataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LocalDataImportModal: React.FC<LocalDataImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [summary, setSummary] = useState<{ listsCount: number; itemsCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const household = useAuthStore((state) => state.household);

  useEffect(() => {
    if (isOpen) {
      localDataMigrator.getLocalSummary().then(setSummary);
    }
  }, [isOpen]);

  if (!isOpen || !household || (summary && summary.listsCount === 0)) return null;

  const handleImport = async () => {
    if (!household) return;
    setIsLoading(true);
    setError(null);
    try {
      await localDataMigrator.migrateToHousehold(household.id);
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-slate-800 relative space-y-5">
        <button
          onClick={onClose}
          aria-label="Skip import"
          className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-md shadow-emerald-500/20">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Import Device History?</h2>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Share your existing lists with {household.name}
            </p>
          </div>
        </div>

        {success ? (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
              Successfully imported {summary?.listsCount} lists into your household!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              We found <strong className="text-gray-900 dark:text-white">{summary?.listsCount} saved list{summary?.listsCount !== 1 ? 's' : ''}</strong> ({summary?.itemsCount} items) on this device.
            </p>
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Would you like to upload them to your new shared household so family members can view and repeat them?
            </p>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto flex-1 py-2.5 px-4 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-semibold text-xs rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Skip (Keep Local)
              </button>

              <button
                type="button"
                onClick={handleImport}
                disabled={isLoading}
                className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Import to Household</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
