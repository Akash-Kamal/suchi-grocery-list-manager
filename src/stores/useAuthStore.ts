import { create } from 'zustand';
import type { User, Session, EmailOtpType } from '@supabase/supabase-js';
import { supabase, checkIsSupabaseConfigured } from '../lib/supabaseClient';
import type { Household, HouseholdMember, MemberRole } from '../types/database';
import { syncManager } from '../services/syncManager';
import { realtimeSync } from '../services/realtimeSync';
import { householdRepository } from '../repositories/remote/householdRepository';
import { db } from '../db';
import { useDraftListStore } from './useDraftListStore';

interface AuthState {
  user: User | null;
  session: Session | null;
  household: Household | null;
  membership: HouseholdMember | null;
  members: HouseholdMember[];
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initializeAuth: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ user: User | null; needsEmailVerification: boolean; error: Error | null }>;
  verifyEmailOtp: (email: string, token: string, type?: EmailOtpType) => Promise<{ session: Session | null; user: User | null; error: Error | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ user: User | null; needsEmailVerification: boolean; error: Error | null }>;
  resendVerificationOtp: (email: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  fetchUserHousehold: () => Promise<void>;
  fetchHouseholdMembers: () => Promise<HouseholdMember[]>;
  setHousehold: (household: Household | null, membership: HouseholdMember | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  household: null,
  membership: null,
  members: [],
  isLoading: false,
  isInitialized: false,
  error: null,

  initializeAuth: async () => {
    if (!checkIsSupabaseConfigured() || !supabase) {
      set({ isInitialized: true, isLoading: false });
      return;
    }

    try {
      set({ isLoading: true, error: null });
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        set({ error: error.message, isInitialized: true, isLoading: false });
        return;
      }

      if (session?.user) {
        set({ session, user: session.user });
        await get().fetchUserHousehold();
      } else {
        set({ session: null, user: null, household: null, membership: null, members: [] });
      }

      // Listen for subsequent auth state changes (sign in, token refresh, sign out)
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        const currentUser = get().user;
        if (newSession?.user?.id !== currentUser?.id) {
          set({ session: newSession, user: newSession?.user ?? null });
          if (newSession?.user) {
            await get().fetchUserHousehold();
          } else {
            realtimeSync.unsubscribe();
            set({ household: null, membership: null, members: [] });
          }
        } else if (newSession) {
          set({ session: newSession });
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Auth initialization failed';
      set({ error: msg });
    } finally {
      set({ isInitialized: true, isLoading: false });
    }
  },

  signUp: async (email: string, password: string, fullName: string) => {
    if (!supabase) {
      const err = new Error('Supabase client is not configured.');
      set({ error: err.message });
      return { user: null, needsEmailVerification: false, error: err };
    }

    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return { user: null, needsEmailVerification: false, error };
      }

      const user = data.user;
      // If email confirmation is required and email is not yet confirmed
      const needsEmailVerification = Boolean(user && !user.email_confirmed_at && !data.session);

      if (data.session && user) {
        set({ session: data.session, user, isLoading: false });
        await get().fetchUserHousehold();
      } else {
        set({ isLoading: false });
      }

      return { user, needsEmailVerification, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign up';
      const errorObj = err instanceof Error ? err : new Error(msg);
      set({ error: msg, isLoading: false });
      return { user: null, needsEmailVerification: false, error: errorObj };
    }
  },

  verifyEmailOtp: async (email: string, token: string, type: EmailOtpType = 'signup') => {
    if (!supabase) {
      const err = new Error('Supabase client is not configured.');
      set({ error: err.message });
      return { session: null, user: null, error: err };
    }

    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type,
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return { session: null, user: null, error };
      }

      if (data.session && data.user) {
        set({ session: data.session, user: data.user, isLoading: false });
        await get().fetchUserHousehold();
      } else {
        set({ isLoading: false });
      }

      return { session: data.session, user: data.user, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OTP verification failed';
      const errorObj = err instanceof Error ? err : new Error(msg);
      set({ error: msg, isLoading: false });
      return { session: null, user: null, error: errorObj };
    }
  },

  signInWithPassword: async (email: string, password: string) => {
    if (!supabase) {
      const err = new Error('Supabase client is not configured.');
      set({ error: err.message });
      return { user: null, needsEmailVerification: false, error: err };
    }

    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const isUnconfirmed = error.message.toLowerCase().includes('email not confirmed');
        set({ error: error.message, isLoading: false });
        return { user: null, needsEmailVerification: isUnconfirmed, error };
      }

      if (data.session && data.user) {
        set({ session: data.session, user: data.user, isLoading: false });
        await get().fetchUserHousehold();
        return { user: data.user, needsEmailVerification: false, error: null };
      }

      set({ isLoading: false });
      return { user: null, needsEmailVerification: false, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      const errorObj = err instanceof Error ? err : new Error(msg);
      set({ error: msg, isLoading: false });
      return { user: null, needsEmailVerification: false, error: errorObj };
    }
  },

  resendVerificationOtp: async (email: string) => {
    if (!supabase) {
      const err = new Error('Supabase client is not configured.');
      set({ error: err.message });
      return { error: err };
    }

    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return { error };
      }

      set({ isLoading: false });
      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code';
      const errorObj = err instanceof Error ? err : new Error(msg);
      set({ error: msg, isLoading: false });
      return { error: errorObj };
    }
  },

  requestPasswordReset: async (email: string) => {
    if (!supabase) {
      const err = new Error('Supabase client is not configured.');
      set({ error: err.message });
      return { error: err };
    }

    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

      if (error) {
        set({ error: error.message, isLoading: false });
        return { error };
      }

      set({ isLoading: false });
      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request password reset';
      const errorObj = err instanceof Error ? err : new Error(msg);
      set({ error: msg, isLoading: false });
      return { error: errorObj };
    }
  },

  updatePassword: async (newPassword: string) => {
    if (!supabase) {
      const err = new Error('Supabase client is not configured.');
      set({ error: err.message });
      return { error: err };
    }

    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        set({ error: error.message, isLoading: false });
        return { error };
      }

      set({ isLoading: false });
      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      const errorObj = err instanceof Error ? err : new Error(msg);
      set({ error: msg, isLoading: false });
      return { error: errorObj };
    }
  },

  signOut: async () => {
    realtimeSync.unsubscribe();
    if (supabase) {
      await supabase.auth.signOut();
    }

    // Purge user-specific local data from Dexie to prevent cross-account leakage
    try {
      await db.transaction('rw', [db.groceryLists, db.listItems, db.pendingSyncOps, db.favorites, db.shoppingSessions, db.shoppingSessionEvents], async () => {
        await db.groceryLists.clear();
        await db.listItems.clear();
        await db.pendingSyncOps.clear();
        await db.favorites.clear();
        await db.shoppingSessions.clear();
        await db.shoppingSessionEvents.clear();
      });
    } catch (clearErr) {
      console.warn('Error clearing local user data on sign out:', clearErr);
    }

    // Reset draft list store state
    useDraftListStore.setState({
      currentList: null,
      items: [],
      isLoading: false,
      error: null,
    });

    set({
      user: null,
      session: null,
      household: null,
      membership: null,
      error: null,
    });
  },

  fetchUserHousehold: async () => {
    if (!supabase) return;
    const { user } = get();
    if (!user) return;

    try {
      // Find user's membership row (ordered by newest first, to avoid PGRST116 if old memberships lingered)
      const { data: memberRows, error: memberError } = await supabase
        .from('household_members')
        .select('*')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false });

      if (memberError) {
        console.error('Error fetching household membership:', memberError);
        return;
      }

      if (!memberRows || memberRows.length === 0) {
        realtimeSync.unsubscribe();
        const hadHousehold = get().household !== null;
        if (hadHousehold) {
          try {
            await db.transaction('rw', [db.groceryLists, db.listItems, db.favorites], async () => {
              await db.groceryLists.clear();
              await db.listItems.clear();
              await db.favorites.clear();
            });
          } catch (cleanErr) {
            console.warn('Could not clear household data on leave:', cleanErr);
          }
          useDraftListStore.setState({ currentList: null, items: [], isLoading: false, error: null });
        }
        set({ household: null, membership: null, members: [] });
        return;
      }

      const memberData = memberRows[0];
      const membership: HouseholdMember = {
        id: memberData.id,
        household_id: memberData.household_id,
        user_id: memberData.user_id,
        role: memberData.role as MemberRole,
        joined_at: memberData.joined_at,
        email: user.email,
      };

      // Fetch household details
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('*')
        .eq('id', memberData.household_id)
        .single();

      if (householdError || !householdData) {
        console.error('Error fetching household details:', householdError);
        set({ membership, household: null });
        return;
      }

      const household = householdData as Household;

      // Fetch all members of this household with real names & emails via RPC
      const members = await householdRepository.getMembers(household.id);

      set({
        household,
        membership,
        members: members.length > 0 ? members : [membership],
      });

      // Hydrate local cache, subscribe to Realtime, then reload draft list store
      try {
        await syncManager.pullHouseholdData(household.id);
        await useDraftListStore.getState().loadDraftList();
      } catch (pullErr) {
        console.warn('Household data hydration error:', pullErr);
      }
      realtimeSync.subscribeHousehold(household.id);
    } catch (err) {
      console.error('Failed to load user household:', err);
    }
  },

  fetchHouseholdMembers: async () => {
    const { household } = get();
    if (!household) {
      set({ members: [] });
      return [];
    }

    try {
      const members = await householdRepository.getMembers(household.id);
      set({ members });
      return members;
    } catch (err) {
      console.error('Failed to fetch household members:', err);
      return get().members;
    }
  },

  setHousehold: async (household, membership) => {
    set({ household, membership, members: membership ? [membership] : [] });
    if (household) {
      try {
        await syncManager.pullHouseholdData(household.id);
        await useDraftListStore.getState().loadDraftList();
      } catch (pullErr) {
        console.warn('Household data hydration error:', pullErr);
      }
      realtimeSync.subscribeHousehold(household.id);
      get().fetchHouseholdMembers();
    } else {
      realtimeSync.unsubscribe();
    }
  },

  clearError: () => set({ error: null }),
}));
