import React from 'react';
import { useSyncStatus } from '../../lib/syncContext';
import { Loader2 } from 'lucide-react';

interface LiveSyncBadgeProps {
  compact?: boolean;
  className?: string;
}

export const LiveSyncBadge: React.FC<LiveSyncBadgeProps> = ({ compact = false, className = '' }) => {
  const { isOnline, isHouseholdActive, pendingOpsCount, hasPendingSync } = useSyncStatus();

  if (!isHouseholdActive) return null;

  if (compact) {
    if (hasPendingSync) {
      return (
        <span
          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 ${className}`}
          title={`Syncing ${pendingOpsCount} pending change(s)...`}
        >
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          <span>Syncing…</span>
        </span>
      );
    }

    if (!isOnline) {
      return (
        <span
          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/20 text-gray-600 dark:text-slate-400 border border-gray-500/30 ${className}`}
          title="Offline mode active. Changes will sync when reconnected."
        >
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
          <span>Offline</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 ${className}`}
        title="Connected to live Supabase Realtime sync"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>Live</span>
      </span>
    );
  }

  // Full format
  return (
    <div
      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
        hasPendingSync
          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
          : !isOnline
          ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700'
          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
      } ${className}`}
    >
      {hasPendingSync ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400" />
          <span>Syncing ({pendingOpsCount})…</span>
        </>
      ) : !isOnline ? (
        <>
          <span className="w-2 h-2 rounded-full bg-gray-400"></span>
          <span>Offline (Queued)</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
          <span>Live Sync</span>
        </>
      )}
    </div>
  );
};
