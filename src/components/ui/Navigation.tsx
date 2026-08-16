import React from 'react';
import { Home, ShoppingBag, ListChecks, History, Settings, Info, Users, UserPlus, Crown, LogIn, Share2 } from 'lucide-react';
import { useDraftListStore } from '../../stores/useDraftListStore';
import { useSyncStatus } from '../../lib/syncContext';
import { useAuthStore } from '../../stores/useAuthStore';

export type TabPath = '/' | '/catalog' | '/review' | '/history' | '/settings' | '/about';

interface NavigationProps {
  currentPath: TabPath;
  onNavigate: (path: TabPath) => void;
  onOpenAuth: () => void;
  onOpenHouseholdSetup: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentPath,
  onNavigate,
  onOpenAuth,
  onOpenHouseholdSetup,
}) => {
  const items = useDraftListStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const { isOnline, isHouseholdActive, householdName, pendingOpsCount, hasPendingSync } = useSyncStatus();
  const { user, household, membership } = useAuthStore();

  const isOwner = membership?.role === 'owner';

  const navItems = [
    { path: '/' as TabPath, label: 'Home', icon: Home },
    { path: '/catalog' as TabPath, label: 'Catalog', icon: ShoppingBag },
    { path: '/review' as TabPath, label: 'Current List', icon: ListChecks, badge: itemCount },
    { path: '/history' as TabPath, label: 'History', icon: History },
    { path: '/settings' as TabPath, label: 'Settings', icon: Settings },
    { path: '/about' as TabPath, label: 'About', icon: Info },
  ];

  return (
    <>
      {/* Mobile Top Header with Quick Household / Auth Access */}
      <header className="md:hidden sticky top-0 z-30 bg-emerald-950/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-emerald-800/60 dark:border-slate-800 px-4 py-2 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2">
          <img
            src="/suchi-logo.png"
            alt="Suchi Logo"
            className="w-8 h-8 object-contain shrink-0 drop-shadow"
          />
          <div>
            <h1 className="text-sm font-black text-white tracking-tight leading-tight">Suchi</h1>
            <p className="text-[10px] text-emerald-300 dark:text-emerald-400 font-medium leading-none">Grocery List Manager</p>
          </div>
        </div>

        {/* Mobile Quick Action Pill */}
        {!user ? (
          <button
            onClick={onOpenAuth}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-bold shadow cursor-pointer transition-all active:scale-95"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In / Join</span>
          </button>
        ) : !household ? (
          <button
            onClick={onOpenHouseholdSetup}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-bold shadow cursor-pointer transition-all active:scale-95"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Join Household</span>
          </button>
        ) : (
          <button
            onClick={onOpenHouseholdSetup}
            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-900/90 border border-emerald-700/80 text-emerald-200 hover:text-white rounded-full text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="truncate max-w-[110px]">{household.name}</span>
            <Share2 className="w-3 h-3 text-emerald-400" />
          </button>
        )}
      </header>

      {/* Desktop & Tablet Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-emerald-950/95 dark:bg-slate-900/95 backdrop-blur-xl text-white border-r border-emerald-800/60 dark:border-slate-800 z-40 p-4 shadow-2xl overflow-y-auto">
        <div className="flex items-center space-x-2 px-1 py-3 mb-4 border-b border-emerald-800/60 dark:border-slate-800">
          <div className="relative shrink-0">
            <img
              src="/suchi-logo.png"
              alt="Suchi Logo"
              className="w-11 h-11 object-contain drop-shadow-md hover:scale-105 transition-transform duration-200"
            />
          </div>
          <div className="overflow-hidden">
            <h1 className="text-xl font-black tracking-tight text-white leading-tight">Suchi</h1>
            <p className="text-[11px] text-emerald-300 dark:text-emerald-400 font-semibold truncate">
              Grocery List Manager
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 translate-x-1'
                    : 'text-emerald-100 dark:text-slate-300 hover:bg-emerald-800/40 dark:hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-emerald-300 dark:text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                      isActive ? 'bg-white text-emerald-900' : 'bg-emerald-500 text-emerald-950'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ==================================================================== */}
        {/* TOP-LEVEL AUTH & HOUSEHOLD SHARING AREA (OUTSIDE SETTINGS) */}
        {/* ==================================================================== */}
        <div className="my-4">
          {!user ? (
            /* STATE A: NOT SIGNED IN */
            <div className="p-3.5 bg-gradient-to-b from-emerald-900/70 to-emerald-950/90 dark:from-slate-800/80 dark:to-slate-900/90 border border-emerald-700/60 dark:border-slate-700 rounded-2xl space-y-2.5 shadow-md">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-black text-white">Live Family Sync</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                Sync grocery lists live across up to 9 family members' devices.
              </p>
              <button
                onClick={onOpenAuth}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center space-x-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In / Create Account</span>
              </button>
            </div>
          ) : !household ? (
            /* STATE B: SIGNED IN, NO HOUSEHOLD */
            <div className="p-4 bg-emerald-900/80 dark:bg-slate-800/90 border border-emerald-700/70 dark:border-slate-700 rounded-2xl space-y-2.5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Account</span>
                <span className="text-[10px] font-black text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-700/60">
                  Verified ✓
                </span>
              </div>
              <div>
                <h3 className="text-base font-black text-white tracking-tight truncate">
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </h3>
                <p className="text-[11px] text-emerald-200/80 truncate">{user.email}</p>
              </div>
              <button
                onClick={onOpenHouseholdSetup}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Create / Join Household</span>
              </button>
            </div>
          ) : (
            /* STATE C: SIGNED IN & IN A HOUSEHOLD */
            <div className="p-4 bg-gradient-to-b from-emerald-900/90 to-emerald-950 dark:from-slate-800/95 dark:to-slate-900 border border-emerald-600/80 dark:border-emerald-800 rounded-2xl space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-emerald-800/70 pb-2">
                <div className="flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black text-emerald-200 tracking-wide truncate max-w-[110px]">
                    {household.name}
                  </span>
                </div>
                <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isOwner ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {isOwner && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                  <span>{isOwner ? 'Owner' : 'Member'}</span>
                </span>
              </div>

              {/* Big and Bold User Name Display */}
              <div className="space-y-0.5">
                <h3 className="text-base font-black text-white tracking-tight truncate drop-shadow-sm">
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </h3>
                <p className="text-[11px] text-emerald-200/80 truncate font-medium">
                  {user.email}
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-0.5">
                <button
                  onClick={onOpenHouseholdSetup}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all flex items-center justify-center space-x-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invite</span>
                </button>
                <button
                  onClick={() => onNavigate('/settings')}
                  className="px-3 py-2 bg-emerald-950 hover:bg-emerald-900 text-emerald-200 hover:text-white rounded-xl text-xs font-bold border border-emerald-800/80 transition-all cursor-pointer"
                  title="Household Settings & Members"
                >
                  Manage
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Sync Status Footer */}
        <div className="mt-auto pt-4 border-t border-emerald-800/60 dark:border-slate-800 text-center space-y-1">
          {isHouseholdActive ? (
            <div className="flex flex-col items-center">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-900/90 text-emerald-200 border border-emerald-700/60 shadow-sm">
                <span className={`w-2 h-2 rounded-full mr-1.5 ${hasPendingSync ? 'bg-amber-400 animate-spin' : isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`}></span>
                {hasPendingSync ? `Syncing (${pendingOpsCount})...` : isOnline ? 'Live Household Sync' : 'Offline (Queued)'}
              </span>
              {householdName && (
                <span className="text-[10px] text-emerald-300/80 font-medium truncate max-w-[180px] mt-0.5">
                  {householdName}
                </span>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 dark:bg-slate-800/80 text-emerald-300 dark:text-emerald-400 border border-emerald-700/50 dark:border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
              Offline-First Active
            </span>
          )}

          {/* Copyright Footer */}
          <div className="pt-3 border-t border-emerald-900/60 dark:border-slate-800/60 text-center text-[10px] text-emerald-300/60 dark:text-slate-500 font-medium">
            © 2026 SUCHI. All rights reserved.
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="block md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-emerald-100 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] px-2 py-1.5">
        <div className="flex justify-around items-center max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={`relative flex flex-col items-center py-1.5 px-3 rounded-xl transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold scale-105'
                    : 'text-gray-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-emerald-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] mt-0.5">{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 w-8 h-1 bg-emerald-600 dark:bg-emerald-400 rounded-full animate-fade-in" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
