import React, { useEffect, useState } from 'react';
import { Download, Upload, Moon, Sun, Monitor, Bell, CheckCircle2, ShieldCheck, Scale, Users, UserPlus, LogOut, Copy, Check, Trash2, Crown, Info, ArrowRight, ShieldOff } from 'lucide-react';
import { db } from '../../db';
import { preferenceRepository } from '../../repositories/preferenceRepository';
import { householdRepository } from '../../repositories/remote/householdRepository';
import { useAuthStore } from '../../stores/useAuthStore';
import type { UserPreference, MeasurementSystem, HouseholdMember } from '../../types/database';
import { LoadingState } from '../../components/ui/LoadingState';
import { applyAppTheme } from '../../utils/theme';

interface SettingsPageProps {
  onNavigate: (path: any) => void;
  onOpenAuth?: () => void;
  onOpenHouseholdSetup?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onNavigate,
  onOpenAuth,
  onOpenHouseholdSetup,
}) => {
  const [prefs, setPrefs] = useState<UserPreference | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [reminderDay, setReminderDay] = useState<number>(1);
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystem>('metric');

  // Household & Auth management state
  const { user, household, membership, signOut, fetchUserHousehold } = useAuthStore();
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [isCopiedInvite, setIsCopiedInvite] = useState<boolean>(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState<boolean>(false);
  const [isRevokingInvite, setIsRevokingInvite] = useState<boolean>(false);

  const loadPrefs = async () => {
    setIsLoading(true);
    try {
      const data = await preferenceRepository.getPreferences();
      setPrefs(data);
      setReminderDay(data.reminderDayOfMonth || 1);
      setMeasurementSystem(data.measurementSystem || 'metric');
      if (data.theme) {
        applyAppTheme(data.theme);
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrefs();
  }, []);

  useEffect(() => {
    if (household) {
      householdRepository.getMembers(household.id).then(setMembers);
    } else {
      setMembers([]);
    }
  }, [household]);

  const handleThemeChange = async (theme: 'light' | 'dark' | 'system') => {
    try {
      const updated = await preferenceRepository.updatePreferences({ theme });
      setPrefs(updated);
      applyAppTheme(theme);
      setMessage({ text: `Theme changed to ${theme} mode`, type: 'success' });
    } catch (err) {
      console.error('Failed to update theme:', err);
    }
  };

  const handleMeasurementSystemChange = async (sys: MeasurementSystem) => {
    try {
      setMeasurementSystem(sys);
      const updated = await preferenceRepository.updatePreferences({ measurementSystem: sys });
      setPrefs(updated);
      setMessage({ text: `Measurement system set to ${sys.toUpperCase()}`, type: 'success' });
    } catch (err) {
      console.error('Failed to update measurement system:', err);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!household || !user) return;
    setIsGeneratingInvite(true);
    try {
      const invite = await householdRepository.generateInvite(household.id, user.id);
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const shareUrl = `${appUrl}/?join=${invite.invite_code}`;

      await navigator.clipboard.writeText(shareUrl);
      setIsCopiedInvite(true);
      setMessage({ text: 'Invite link copied to clipboard! Share it with family members.', type: 'success' });
      setTimeout(() => setIsCopiedInvite(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invite';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!household || !confirm('Remove this member from the household?')) return;
    try {
      await householdRepository.removeMember(household.id, memberUserId);
      const updated = await householdRepository.getMembers(household.id);
      setMembers(updated);
      setMessage({ text: 'Member removed from household', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      setMessage({ text: msg, type: 'error' });
    }
  };

  const handleLeaveHousehold = async () => {
    if (!household || !user || !confirm('Leave this household? You will switch to your private local lists.')) return;
    try {
      await householdRepository.leaveHousehold(household.id, user.id);
      await fetchUserHousehold();
      setMessage({ text: 'Left household successfully', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to leave household';
      setMessage({ text: msg, type: 'error' });
    }
  };

  const handleRevokeInvites = async () => {
    if (!household || !confirm('Revoke all pending invite links? Anyone with an old link will no longer be able to join. Existing members are unaffected.')) return;
    setIsRevokingInvite(true);
    try {
      await householdRepository.revokeAllPendingInvites(household.id);
      setMessage({ text: 'All pending invite links have been revoked. Existing members are not affected.', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke invites';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setIsRevokingInvite(false);
    }
  };

  const handleExportJSON = async () => {
    try {
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        categories: await db.categories.toArray(),
        catalogItems: await db.catalogItems.toArray(),
        itemAliases: await db.itemAliases.toArray(),
        groceryLists: await db.groceryLists.toArray(),
        listItems: await db.listItems.toArray(),
        favorites: await db.favorites.toArray(),
        recurringItemStats: await db.recurringItemStats.toArray(),
        userPreferences: await db.userPreferences.toArray(),
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().split('T')[0];
      const link = document.createElement('a');
      link.href = url;
      link.download = `suchi_grocery_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage({ text: 'Full database backup JSON downloaded successfully', type: 'success' });
    } catch (err) {
      setMessage({ text: 'Export failed', type: 'error' });
      console.error('Export error:', err);
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        if (!data.categories || !data.catalogItems || !data.groceryLists) {
          throw new Error('Invalid backup file format');
        }

        await db.transaction(
          'rw',
          [
            db.categories,
            db.catalogItems,
            db.itemAliases,
            db.groceryLists,
            db.listItems,
            db.favorites,
            db.recurringItemStats,
            db.userPreferences,
          ],
          async () => {
            await db.categories.clear();
            await db.catalogItems.clear();
            await db.itemAliases.clear();
            await db.groceryLists.clear();
            await db.listItems.clear();
            await db.favorites.clear();
            await db.recurringItemStats.clear();
            await db.userPreferences.clear();

            if (data.categories) await db.categories.bulkAdd(data.categories);
            if (data.catalogItems) await db.catalogItems.bulkAdd(data.catalogItems);
            if (data.itemAliases) await db.itemAliases.bulkAdd(data.itemAliases);
            if (data.groceryLists) await db.groceryLists.bulkAdd(data.groceryLists);
            if (data.listItems) await db.listItems.bulkAdd(data.listItems);
            if (data.favorites) await db.favorites.bulkAdd(data.favorites);
            if (data.recurringItemStats) await db.recurringItemStats.bulkAdd(data.recurringItemStats);
            if (data.userPreferences) await db.userPreferences.bulkAdd(data.userPreferences);
          }
        );

        setMessage({ text: 'Database restored successfully from backup!', type: 'success' });
        await loadPrefs();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid backup JSON file';
        setMessage({ text: msg, type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = async () => {
    if (!confirm('Are you sure you want to reset all data and restore starter Indian catalog items?')) {
      return;
    }
    try {
      await db.delete();
      await db.open();
      await db.seedIfEmpty();
      setMessage({ text: 'Database reset to starter Indian catalog preset!', type: 'success' });
      await loadPrefs();
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  const handleReminderDayChange = async (day: number) => {
    setReminderDay(day);
    await preferenceRepository.updatePreferences({ reminderDayOfMonth: day });
    setMessage({ text: `Monthly grocery reminder day set to day ${day}`, type: 'success' });
  };

  if (isLoading) {
    return <LoadingState message="Loading preferences..." />;
  }

  const isOwner = membership?.role === 'owner';

  return (
    <div className="space-y-6 pb-20 animate-fade-in max-w-3xl mx-auto">
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-emerald-100 dark:border-slate-800 shadow-sm">
        <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">Settings & Household</h1>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
          Manage shared household sync, theme, measurement units, and offline backups.
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/60 text-red-900 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Household & Cloud Sync Section */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
              Household & Live Sharing
            </h2>
          </div>

          {user && (
            <button
              onClick={() => signOut()}
              className="inline-flex items-center space-x-1 text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>

        {!user ? (
          /* State 1: Not Logged In */
          <div className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Sign in with your email and password to share live grocery lists with family members across up to 9 devices.
            </p>
            <button
              onClick={onOpenAuth}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>
          </div>
        ) : !household ? (
          /* State 2: Logged in, but no household */
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-100 dark:border-slate-700 space-y-1 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-base sm:text-lg font-black text-gray-900 dark:text-white tracking-tight">
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </span>
                <span className="inline-flex items-center text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Verified ✓
                </span>
              </div>
              <p className="text-gray-500 dark:text-slate-400 text-xs font-medium">{user.email}</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              You are signed in! Create a household for your home or enter an invite code to start live sharing.
            </p>
            <button
              onClick={onOpenHouseholdSetup}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-2"
            >
              <Users className="w-4 h-4" />
              <span>Create or Join Household</span>
            </button>
          </div>
        ) : (
          /* State 3: Logged in AND in a household */
          <div className="space-y-4">
            {/* Household Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs uppercase tracking-wider font-black text-emerald-700 dark:text-emerald-400">
                    {household.name}
                  </span>
                  <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isOwner ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-200' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300'
                  }`}>
                    {isOwner && <Crown className="w-2.5 h-2.5 text-amber-600" />}
                    <span>{isOwner ? 'Owner' : 'Member'}</span>
                  </span>
                </div>
                
                {/* Big and Bold User Name in Settings */}
                <h3 className="text-lg sm:text-xl font-black text-emerald-950 dark:text-white tracking-tight">
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </h3>
                <p className="text-xs text-emerald-800 dark:text-emerald-400 font-medium">
                  {user.email}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCopyInviteLink}
                  disabled={isGeneratingInvite}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all disabled:opacity-50"
                >
                  {isCopiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopiedInvite ? 'Copied!' : 'Copy Invite Link'}</span>
                </button>

                {isOwner && (
                  <button
                    onClick={handleRevokeInvites}
                    disabled={isRevokingInvite}
                    title="Revoke all unused invite links (existing members unaffected)"
                    className="inline-flex items-center space-x-1.5 px-3 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold text-xs rounded-xl cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    <span>{isRevokingInvite ? 'Revoking...' : 'Revoke Invites'}</span>
                  </button>
                )}

                {!isOwner && (
                  <button
                    onClick={handleLeaveHousehold}
                    className="px-3 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold text-xs rounded-xl cursor-pointer"
                  >
                    Leave
                  </button>
                )}
              </div>
            </div>

            {/* Member List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">
                Household Members ({members.length})
              </h4>

              <div className="divide-y divide-gray-100 dark:divide-slate-800 border border-gray-100 dark:border-slate-800 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-slate-800/40">
                {members.map((m) => (
                  <div key={m.id} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-center text-xs">
                        {m.role === 'owner' ? '★' : '👤'}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">
                          {m.user_id === user.id ? `${user.email} (You)` : (m.email || `Member (${m.user_id.slice(0, 6)}...)`)}
                        </p>
                        <p className="text-[10px] text-gray-400 capitalize">{m.role} • Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {isOwner && m.user_id !== user.id && (
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        aria-label="Remove member"
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Measurement System Selector */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 border-b border-gray-100 dark:border-slate-800 pb-2">
          <Scale className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
            Measurement System Preference
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleMeasurementSystemChange('metric')}
            aria-label="Set Metric Measurement System"
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
              measurementSystem === 'metric'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 shadow-xs'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-sm font-black text-emerald-800 dark:text-emerald-400 mb-0.5">Metric</span>
            <span className="text-[10px] text-gray-500 dark:text-slate-400">kg, g, L, ml</span>
          </button>

          <button
            onClick={() => handleMeasurementSystemChange('imperial')}
            aria-label="Set Imperial Measurement System"
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
              measurementSystem === 'imperial'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 shadow-xs'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-sm font-black text-emerald-800 dark:text-emerald-400 mb-0.5">Imperial</span>
            <span className="text-[10px] text-gray-500 dark:text-slate-400">lb, oz, fl-oz</span>
          </button>

          <button
            onClick={() => handleMeasurementSystemChange('household')}
            aria-label="Set Household Measurement System"
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
              measurementSystem === 'household'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 shadow-xs'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-sm font-black text-emerald-800 dark:text-emerald-400 mb-0.5">Household</span>
            <span className="text-[10px] text-gray-500 dark:text-slate-400">pack, piece, dozen</span>
          </button>
        </div>
      </div>

      {/* Appearance Theme Selector */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 pb-2">
          Appearance Theme
        </h2>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => handleThemeChange('light')}
            aria-label="Set Light Theme"
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
              prefs?.theme === 'light'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 shadow-xs'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <Sun className="w-5 h-5 mb-1 text-amber-500" />
            <span>Light</span>
          </button>

          <button
            onClick={() => handleThemeChange('dark')}
            aria-label="Set Dark Theme"
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
              prefs?.theme === 'dark'
                ? 'border-emerald-600 bg-emerald-950 text-emerald-300 shadow-xs'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <Moon className="w-5 h-5 mb-1 text-purple-400" />
            <span>Dark</span>
          </button>

          <button
            onClick={() => handleThemeChange('system')}
            aria-label="Set System Theme"
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
              prefs?.theme === 'system'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 shadow-xs'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <Monitor className="w-5 h-5 mb-1 text-gray-500" />
            <span>System</span>
          </button>
        </div>
      </div>

      {/* Monthly Reminder Settings */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 pb-2">
          Monthly Grocery Schedule
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <Bell className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-gray-900 dark:text-white">Reminder Day of Month</h3>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">Day when Suchi prompts to start new list</p>
            </div>
          </div>

          <select
            value={reminderDay}
            onChange={(e) => handleReminderDayChange(Number(e.target.value))}
            aria-label="Select reminder day of month"
            className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white cursor-pointer"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Day {d} of Month
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Local-First Backup & Restore */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 pb-2">
          Data Backup & Restore
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleExportJSON}
            aria-label="Export Full JSON Backup"
            className="flex items-center justify-center space-x-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Export JSON Backup</span>
          </button>

          <label
            aria-label="Restore Data from JSON Backup File"
            className="flex items-center justify-center space-x-2 py-3 px-4 bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 font-bold text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 cursor-pointer transition-all active:scale-95"
          >
            <Upload className="w-4 h-4" />
            <span>Restore from JSON File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>
        </div>

        <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>100% Offline & Private (IndexedDB)</span>
          </div>

          <button
            onClick={handleResetDatabase}
            aria-label="Reset and Restore Starter Catalog"
            className="text-xs font-semibold text-red-600 hover:text-red-700 underline cursor-pointer"
          >
            Reset to Starter Preset
          </button>
        </div>
      </div>

      {/* About SUCHI Platform Card */}
      <div className="bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-900 rounded-2xl p-5 sm:p-6 text-white border border-emerald-800/60 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <img
            src="/suchi-logo.png"
            alt="SUCHI"
            className="w-12 h-12 object-contain drop-shadow-md shrink-0"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-black text-white">About SUCHI</h3>
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-400/30">
                v2.0
              </span>
            </div>
            <p className="text-xs text-emerald-200/80 mt-0.5">
              A smarter way to plan, organize, and manage everyday groceries.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('/about')}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all shrink-0"
        >
          <Info className="w-4 h-4" />
          <span>View Platform Guide</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
