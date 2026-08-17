import React, { useState } from 'react';
import { Users, Crown, UserPlus, ShieldCheck, Settings as SettingsIcon } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { LiveSyncBadge } from './LiveSyncBadge';
import { HouseholdMembersModal } from './HouseholdMembersModal';

interface HouseholdHeaderProps {
  onNavigate?: (path: any) => void;
  onOpenInvite?: () => void;
  compact?: boolean;
  className?: string;
}

export const HouseholdHeader: React.FC<HouseholdHeaderProps> = ({
  onNavigate,
  onOpenInvite,
  compact = false,
  className = '',
}) => {
  const { user, household, membership, members } = useAuthStore();
  const [showMembersModal, setShowMembersModal] = useState(false);

  if (!household || !user) return null;

  const isOwner = membership?.role === 'owner';
  const ownerMember = members.find((m) => m.role === 'owner');

  // Derive owner's display name
  const ownerDisplayName = isOwner
    ? 'You'
    : ownerMember?.email
    ? ownerMember.email.split('@')[0]
    : 'Household Owner';

  if (compact) {
    return (
      <>
        <div
          className={`flex items-center justify-between px-3.5 py-2 bg-emerald-950/80 dark:bg-slate-900/90 text-white rounded-xl border border-emerald-800/60 dark:border-slate-800 shadow-sm ${className}`}
        >
          <div className="flex items-center space-x-2 min-w-0">
            <span className="p-1 bg-emerald-800/80 text-emerald-300 rounded-lg text-xs">🏠</span>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-black text-white truncate max-w-[140px]">
                  {household.name}
                </span>
                <span className="text-[10px] text-emerald-300/80 font-medium truncate">
                  {isOwner ? '👑 You' : `• Shared by ${ownerDisplayName}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setShowMembersModal(true)}
              className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 rounded-lg text-[10px] font-bold border border-emerald-700/60 transition-colors cursor-pointer"
            >
              <Users className="w-3 h-3" />
              <span>{members.length || 1}</span>
            </button>
            <LiveSyncBadge compact />
          </div>
        </div>

        <HouseholdMembersModal
          isOpen={showMembersModal}
          onClose={() => setShowMembersModal(false)}
          onOpenInvite={onOpenInvite}
        />
      </>
    );
  }

  // Full Rich Header Card
  return (
    <>
      <div
        className={`bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 text-white rounded-3xl p-5 md:p-6 border border-emerald-700/60 shadow-xl relative overflow-hidden ${className}`}
      >
        {/* Background Accent Decorative Icon */}
        <div className="absolute right-3 -bottom-4 opacity-10 pointer-events-none">
          <Users className="w-36 h-36 text-white" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            {/* Top row badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-900/90 text-emerald-200 border border-emerald-700/80 rounded-full text-xs font-black uppercase tracking-wider shadow-sm">
                <span>🏠</span>
                <span>Shared Household</span>
              </span>

              <span
                className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isOwner
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                {isOwner ? <Crown className="w-3 h-3 text-amber-400" /> : <ShieldCheck className="w-3 h-3 text-emerald-400" />}
                <span>{isOwner ? 'Owner' : 'Member'}</span>
              </span>

              <LiveSyncBadge compact />
            </div>

            {/* Household Name */}
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight drop-shadow-sm">
                {household.name}
              </h2>
              <p className="text-xs md:text-sm text-emerald-200/90 font-medium mt-0.5">
                {isOwner ? (
                  <span>
                    Created by you • Live synced across <strong className="text-white">{members.length || 1} family devices</strong>
                  </span>
                ) : (
                  <span>
                    Shared with you by <strong className="text-white font-bold">{ownerDisplayName}</strong> • Live synced
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-0">
            <button
              onClick={() => setShowMembersModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-900/90 hover:bg-emerald-800 active:scale-95 text-emerald-100 rounded-xl text-xs font-bold border border-emerald-700/80 shadow-sm transition-all cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>{members.length || 1} Members</span>
            </button>

            {isOwner && onOpenInvite && (
              <button
                onClick={onOpenInvite}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Invite Member</span>
              </button>
            )}

            {onNavigate && (
              <button
                onClick={() => onNavigate('/settings')}
                className="inline-flex items-center space-x-1 px-3 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-white rounded-xl text-xs font-semibold border border-emerald-800/80 transition-colors cursor-pointer"
                title="Household Settings & Sharing"
              >
                <SettingsIcon className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Members Modal */}
      <HouseholdMembersModal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        onOpenInvite={onOpenInvite}
      />
    </>
  );
};
