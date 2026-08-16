import React, { useState } from 'react';
import { Users, Plus, Key, ArrowRight, AlertCircle, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { householdRepository } from '../../repositories/remote/householdRepository';

interface HouseholdSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultInviteCode?: string;
}

export const HouseholdSetupModal: React.FC<HouseholdSetupModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultInviteCode = '',
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(defaultInviteCode ? 'join' : 'create');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState(defaultInviteCode);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { user, fetchUserHousehold } = useAuthStore();

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdName.trim() || !user) return;

    setIsLoading(true);
    setError(null);
    try {
      await householdRepository.createHousehold(householdName, user.id);
      await fetchUserHousehold();
      setSuccessMessage(`Household "${householdName.trim()}" created successfully!`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create household';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || !user) return;

    setIsLoading(true);
    setError(null);
    try {
      // Extract raw code if full URL was pasted
      let cleanCode = inviteCode.trim();
      if (cleanCode.includes('/join/')) {
        cleanCode = cleanCode.split('/join/')[1]?.split('?')[0] || cleanCode;
      } else if (cleanCode.includes('join=')) {
        cleanCode = new URLSearchParams(cleanCode.split('?')[1]).get('join') || cleanCode;
      }

      const result = await householdRepository.redeemInvite(cleanCode);
      await fetchUserHousehold();
      setSuccessMessage(`Joined household "${result.householdName}"!`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join household';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-slate-800 relative space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close setup modal"
          className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-md shadow-emerald-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Household Setup</h2>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Create a new household or join your family
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setError(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Create Household
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('join');
              setError(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'join'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Join with Code
          </button>
        </div>

        {successMessage ? (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">{successMessage}</p>
          </div>
        ) : activeTab === 'create' ? (
          /* Create Household Tab */
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Create a shared household. You will be the owner and can invite family members using an invite link.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="household-name" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Household Name
              </label>
              <input
                id="household-name"
                type="text"
                required
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. The Sharma Family, 402 Palm Heights"
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !householdName.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Household...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Household</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Join with Code Tab */
          <form onSubmit={handleJoin} className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Paste the invite code or link shared with you by your household owner.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="invite-code" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Invite Code or Link
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="invite-code"
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste invite link or code (e.g. aB3-9xQ_)"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !inviteCode.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Joining Household...</span>
                </>
              ) : (
                <>
                  <span>Join Household</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
