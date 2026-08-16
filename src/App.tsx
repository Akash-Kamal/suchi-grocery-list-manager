import React, { useState, useEffect } from 'react';
import { Navigation, type TabPath } from './components/ui/Navigation';
import { HomePage } from './pages/Home/HomePage';
import { CatalogPage } from './pages/Catalog/CatalogPage';
import { ListReviewPage } from './pages/ListReview/ListReviewPage';
import { HistoryPage } from './pages/History/HistoryPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { AboutPage } from './pages/About/AboutPage';
import { ListDetailPage } from './pages/ListDetail/ListDetailPage';
import { ShoppingModePage } from './pages/ShoppingMode/ShoppingModePage';
import { AuthModal } from './components/auth/AuthModal';
import { HouseholdSetupModal } from './components/auth/HouseholdSetupModal';
import { LocalDataImportModal } from './components/auth/LocalDataImportModal';
import { useDraftListStore } from './stores/useDraftListStore';
import { useAuthStore } from './stores/useAuthStore';
import { preferenceRepository } from './repositories/preferenceRepository';
import { localDataMigrator } from './services/localDataMigrator';
import { supabase } from './lib/supabaseClient';
import type { EmailOtpType } from '@supabase/supabase-js';

export const applyAppTheme = (theme: 'light' | 'dark' | 'system') => {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
};

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<TabPath>('/');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isShoppingMode, setIsShoppingMode] = useState<boolean>(false);

  // Global Auth / Household / Migration Modal states
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showHouseholdModal, setShowHouseholdModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [pendingInviteCode, setPendingInviteCode] = useState<string>('');

  const loadDraftList = useDraftListStore((state) => state.loadDraftList);
  const { user, household, initializeAuth } = useAuthStore();

  useEffect(() => {
    loadDraftList();
    initializeAuth();
    preferenceRepository.getPreferences().then((prefs) => {
      if (prefs?.theme) {
        applyAppTheme(prefs.theme);
      }
    });

    // 1. Check for email verification link parameters (token_hash or code from default Supabase email)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenHash = urlParams.get('token_hash');
    const authCode = urlParams.get('code');
    const authType = (urlParams.get('type') as EmailOtpType) || 'signup';

    if (supabase && (tokenHash || authCode)) {
      if (tokenHash) {
        supabase.auth.verifyOtp({ token_hash: tokenHash, type: authType }).then(({ data, error }) => {
          if (!error && data?.session) {
            initializeAuth();
            setShowAuthModal(false);
          }
        });
      } else if (authCode) {
        supabase.auth.exchangeCodeForSession(authCode).then(({ data, error }) => {
          if (!error && data?.session) {
            initializeAuth();
            setShowAuthModal(false);
          }
        });
      }
    }

    // 2. Check for invite link parameters (e.g. ?join=CODE or path /join/CODE)
    const joinCode = urlParams.get('join');
    const pathSegments = window.location.pathname.split('/');
    const pathJoinCode = pathSegments[1] === 'join' && pathSegments[2] ? pathSegments[2] : null;

    const code = joinCode || pathJoinCode;
    if (code) {
      setPendingInviteCode(code);
    }

    // Clean up query parameters from browser address bar smoothly
    if (tokenHash || authCode || joinCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loadDraftList, initializeAuth]);

  // Auto close auth modal when user becomes authenticated
  useEffect(() => {
    if (user) {
      setShowAuthModal(false);
    }
  }, [user]);

  // Handle pending invite code when auth state changes
  useEffect(() => {
    if (pendingInviteCode) {
      if (!user) {
        setShowAuthModal(true);
      } else if (!household) {
        setShowHouseholdModal(true);
      }
    }
  }, [pendingInviteCode, user, household]);

  const handleHouseholdSetupSuccess = async () => {
    // Check if device has local lists to offer migration
    const summary = await localDataMigrator.getLocalSummary();
    if (summary.listsCount > 0) {
      setShowImportModal(true);
    }
  };

  const handleNavigate = (path: TabPath) => {
    setSelectedListId(null);
    setIsShoppingMode(false);
    setCurrentPath(path);
  };

  const handleSelectList = (listId: string) => {
    setSelectedListId(listId);
    setIsShoppingMode(false);
  };

  const handleStartShopping = (listId: string) => {
    setSelectedListId(listId);
    setIsShoppingMode(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090d16] flex flex-col md:flex-row text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-white transition-colors duration-300">
      {/* Responsive Navigation: Sidebar on Desktop, Bottom Bar on Mobile */}
      <Navigation
        currentPath={currentPath}
        onNavigate={handleNavigate}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenHouseholdSetup={() => setShowHouseholdModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 md:pl-64 min-h-screen p-4 md:p-8 max-w-6xl mx-auto w-full">
        {isShoppingMode && selectedListId ? (
          <ShoppingModePage listId={selectedListId} onNavigate={handleNavigate} />
        ) : selectedListId ? (
          <ListDetailPage
            listId={selectedListId}
            onNavigate={handleNavigate}
            onStartShopping={handleStartShopping}
          />
        ) : (
          <>
            {currentPath === '/' && <HomePage onNavigate={handleNavigate} />}
            {currentPath === '/catalog' && <CatalogPage onNavigate={handleNavigate} />}
            {currentPath === '/review' && <ListReviewPage onNavigate={handleNavigate} />}
            {currentPath === '/history' && <HistoryPage onNavigate={handleNavigate} onSelectList={handleSelectList} />}
            {currentPath === '/settings' && (
              <SettingsPage
                onNavigate={handleNavigate}
                onOpenAuth={() => setShowAuthModal(true)}
                onOpenHouseholdSetup={() => setShowHouseholdModal(true)}
              />
            )}
            {currentPath === '/about' && <AboutPage onNavigate={handleNavigate} />}
          </>
        )}

        {/* Global Footer */}
        <footer className="mt-12 mb-16 md:mb-6 pt-6 text-center text-xs text-gray-400 dark:text-slate-500 font-medium border-t border-gray-100 dark:border-slate-800/80">
          <p>© 2026 SUCHI. All rights reserved.</p>
        </footer>
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMessage={pendingInviteCode ? 'Please sign in to join the shared household.' : undefined}
      />

      {/* Household Setup Modal */}
      <HouseholdSetupModal
        isOpen={showHouseholdModal}
        onClose={() => {
          setShowHouseholdModal(false);
          setPendingInviteCode('');
        }}
        onSuccess={handleHouseholdSetupSuccess}
        defaultInviteCode={pendingInviteCode}
      />

      {/* Local Data Import Modal (Phase 5) */}
      <LocalDataImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => loadDraftList()}
      />
    </div>
  );
};

export default App;
