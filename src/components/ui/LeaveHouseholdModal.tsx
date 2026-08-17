import React, { useState } from 'react';
import { LogOut, AlertTriangle, X, Loader2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { householdRepository } from '../../repositories/remote/householdRepository';

interface LeaveHouseholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LeaveHouseholdModal: React.FC<LeaveHouseholdModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, household, fetchUserHousehold } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !household || !user) return null;

  const handleConfirmLeave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await householdRepository.leaveHousehold(household.id, user.id);
      await fetchUserHousehold();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to leave household';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-red-100 dark:border-slate-800 relative space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          aria-label="Close modal"
          className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-full transition-colors cursor-pointer disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 rounded-2xl">
            <LogOut className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Leave Household?</h2>
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{household.name}</p>
          </div>
        </div>

        {/* Warning Body */}
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
            Are you sure you want to leave <strong className="text-gray-900 dark:text-white">{household.name}</strong>?
          </p>

          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center space-x-2 font-bold text-amber-900 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>What happens next:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-400/90 text-[11px]">
              <li>You will lose access to this household's shared grocery lists.</li>
              <li>You will stop receiving live sync updates from members.</li>
              <li>Your personal private lists will remain safe.</li>
              <li>You can always rejoin anytime with a new invite link.</li>
            </ul>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmLeave}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 cursor-pointer transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Leaving...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                <span>Leave Household</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
