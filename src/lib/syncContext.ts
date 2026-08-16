import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { syncManager } from '../services/syncManager';
import { db } from '../db';

export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingOpsCount, setPendingOpsCount] = useState<number>(0);
  const household = useAuthStore((state) => state.household);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const updatePendingCount = async () => {
      try {
        const count = await db.pendingSyncOps.count();
        setPendingOpsCount(count);
      } catch {
        // Dexie might be closing or opening
      }
    };

    updatePendingCount();
    const unsubscribe = syncManager.onSyncCompleted(updatePendingCount);
    const interval = setInterval(updatePendingCount, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return {
    isOnline,
    isHouseholdActive: Boolean(household),
    householdName: household?.name || null,
    pendingOpsCount,
    hasPendingSync: pendingOpsCount > 0,
  };
}

export { syncManager } from '../services/syncManager';
export { realtimeSync } from '../services/realtimeSync';
