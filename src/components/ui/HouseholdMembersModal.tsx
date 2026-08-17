import React, { useState } from 'react';
import { Users, Crown, Trash2, X, UserPlus, LogOut, Loader2, ShieldCheck, Check, Copy } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { householdRepository } from '../../repositories/remote/householdRepository';
import { LeaveHouseholdModal } from './LeaveHouseholdModal';

interface HouseholdMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInvite?: () => void;
}

export const HouseholdMembersModal: React.FC<HouseholdMembersModalProps> = ({
  isOpen,
  onClose,
  onOpenInvite,
}) => {
  const { user, household, membership, members, fetchHouseholdMembers } = useAuthStore();
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [isCopiedInvite, setIsCopiedInvite] = useState<boolean>(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen || !household || !user) return null;

  const isOwner = membership?.role === 'owner';

  const handleCopyInvite = async () => {
    setIsGeneratingInvite(true);
    try {
      const invite = await householdRepository.generateInvite(household.id, user.id);
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const shareUrl = `${appUrl}/?join=${invite.invite_code}`;
      await navigator.clipboard.writeText(shareUrl);
      setIsCopiedInvite(true);
      setFeedback({ type: 'success', text: 'Invite link copied! Share with family members.' });
      setTimeout(() => setIsCopiedInvite(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate invite';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!confirm('Remove this member from the household?')) return;
    setIsRemovingId(memberUserId);
    setFeedback(null);
    try {
      await householdRepository.removeMember(household.id, memberUserId);
      await fetchHouseholdMembers();
      setFeedback({ type: 'success', text: 'Member removed successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setIsRemovingId(null);
    }
  };

  // Helper to get initials
  const getInitials = (nameOrEmail?: string) => {
    if (!nameOrEmail) return '?';
    const clean = nameOrEmail.split('@')[0].trim();
    const parts = clean.split(/[._-\s]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-emerald-100 dark:border-slate-800 relative space-y-5">
          {/* Close Button */}
          <button
            onClick={onClose}
            aria-label="Close members modal"
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
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black text-gray-900 dark:text-white truncate max-w-[200px]">
                  {household.name}
                </h2>
                <span
                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isOwner
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                  }`}
                >
                  {isOwner ? <Crown className="w-2.5 h-2.5 text-amber-600" /> : <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />}
                  <span>{isOwner ? 'Owner' : 'Member'}</span>
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {members.length} active family {members.length === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/60 text-red-900 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Member list */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-500">
              Household Members
            </h3>

            <div className="divide-y divide-gray-100 dark:divide-slate-800 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-gray-50/50 dark:bg-slate-800/40">
              {members.map((m) => {
                const isCurrentUser = m.user_id === user.id;
                const isThisMemberOwner = m.role === 'owner';
                const displayName = isCurrentUser
                  ? `${user.user_metadata?.full_name || user.email?.split('@')[0]} (You)`
                  : (m as any).name || (m.email ? m.email.split('@')[0] : `Member (${m.user_id.slice(0, 6)}…)`);

                return (
                  <div key={m.id} className="p-3 flex items-center justify-between text-xs hover:bg-white/60 dark:hover:bg-slate-800/80 transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Avatar Circle */}
                      <div
                        className={`w-9 h-9 rounded-full font-black flex items-center justify-center text-xs shrink-0 shadow-sm ${
                          isThisMemberOwner
                            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white'
                            : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                        }`}
                      >
                        {isThisMemberOwner ? '👑' : getInitials(displayName)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <p className="font-bold text-gray-900 dark:text-white truncate max-w-[180px]">
                            {displayName}
                          </p>
                          {isCurrentUser && (
                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.2 rounded">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 capitalize flex items-center space-x-1">
                          <span>{m.role}</span>
                          <span>•</span>
                          <span>Joined {new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </p>
                      </div>
                    </div>

                    {/* Owner controls: remove other members */}
                    {isOwner && !isCurrentUser && (
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        disabled={isRemovingId === m.user_id}
                        aria-label="Remove member"
                        title="Remove member from household"
                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {isRemovingId === m.user_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center space-x-2 pt-2 border-t border-gray-100 dark:border-slate-800">
            {isOwner ? (
              <button
                onClick={handleCopyInvite}
                disabled={isGeneratingInvite}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {isCopiedInvite ? <Check className="w-3.5 h-3.5" /> : isGeneratingInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedInvite ? 'Copied Invite Link!' : 'Copy Invite Link'}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLeaveModal(true)}
                className="flex-1 py-2.5 px-4 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-bold text-xs rounded-xl cursor-pointer transition-colors flex items-center justify-center space-x-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Household</span>
              </button>
            )}

            {onOpenInvite && (
              <button
                onClick={() => {
                  onClose();
                  onOpenInvite();
                }}
                className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                title="Household Setup"
              >
                <UserPlus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Leave Household Confirmation Modal */}
      <LeaveHouseholdModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onSuccess={() => {
          setShowLeaveModal(false);
          onClose();
        }}
      />
    </>
  );
};
