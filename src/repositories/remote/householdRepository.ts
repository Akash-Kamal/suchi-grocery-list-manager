import { supabase } from '../../lib/supabaseClient';
import type { Household, HouseholdMember, HouseholdInvite } from '../../types/database';
import { localDataMigrator } from '../../services/localDataMigrator';

export class HouseholdRepository {
  /**
   * Creates a new household and inserts the creator as the 'owner' member.
   * Automatically migrates any existing local draft lists to the remote household.
   */
  async createHousehold(name: string, userId: string): Promise<{ household: Household; membership: HouseholdMember }> {
    if (!supabase) throw new Error('Supabase client not initialized');

    // 1. Insert household row
    const { data: householdData, error: householdError } = await supabase
      .from('households')
      .insert({
        name: name.trim(),
        created_by: userId,
      })
      .select()
      .single();

    if (householdError || !householdData) {
      throw new Error(householdError?.message || 'Failed to create household');
    }

    const household: Household = householdData;

    // 2. Insert creator as owner in household_members
    const { data: memberData, error: memberError } = await supabase
      .from('household_members')
      .insert({
        household_id: household.id,
        user_id: userId,
        role: 'owner',
      })
      .select()
      .single();

    if (memberError || !memberData) {
      throw new Error(memberError?.message || 'Failed to assign household owner');
    }

    const membership: HouseholdMember = memberData;

    // 3. Automatically upload existing local lists/items to the new household
    try {
      await localDataMigrator.migrateToHousehold(household.id);
    } catch (migErr) {
      console.warn('Auto-migration on household create warning:', migErr);
    }

    return { household, membership };
  }

  /**
   * Generates a new shareable invite for the household (valid for 7 days).
   */
  async generateInvite(householdId: string, userId: string): Promise<HouseholdInvite> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('household_invites')
      .insert({
        household_id: householdId,
        created_by: userId,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to generate invite link');
    }

    return data;
  }

  /**
   * Redeems an invite code to join a household.
   * Uses direct secure Postgres RPC (redeem_household_invite) with Edge Function fallback.
   */
  async redeemInvite(inviteCode: string): Promise<{ householdId: string; householdName: string }> {
    if (!supabase) throw new Error('Supabase client not initialized');

    // Robust cleaning in case a full URL or fragment is passed
    let code = inviteCode.trim();
    if (code.includes('join=')) {
      code = code.split('join=')[1]?.split('&')[0] || code;
    } else if (code.includes('/join/')) {
      code = code.split('/join/')[1]?.split('?')[0] || code;
    }
    code = decodeURIComponent(code).trim();

    if (!code) {
      throw new Error('Please enter a valid invite code or link.');
    }

    // 1. Try secure Postgres RPC function first (direct execution, 0ms cold start)
    const { data: rpcData, error: rpcError } = await supabase.rpc('redeem_household_invite', {
      p_invite_code: code,
    });

    if (!rpcError && rpcData) {
      if (typeof rpcData === 'object' && rpcData !== null) {
        if ('error' in rpcData && rpcData.error) {
          throw new Error(String(rpcData.error));
        }
        if ('household_id' in rpcData && rpcData.household_id) {
          return {
            householdId: String(rpcData.household_id),
            householdName: String(rpcData.household_name || 'Shared Household'),
          };
        }
      }
    }

    // 2. Fallback to Supabase Edge function if RPC not executed or unavailable
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('redeem-invite', {
        body: { invite_code: code },
      });

      if (!fnError && fnData) {
        if (fnData.error) throw new Error(fnData.error);
        return {
          householdId: fnData.household_id,
          householdName: fnData.household_name,
        };
      }

      if (fnError) {
        // If both failed, display the clear error message
        if (rpcError) {
          throw new Error(rpcError.message || fnError.message || 'Failed to redeem invite code');
        }
        throw new Error(fnError.message || 'Failed to redeem invite code');
      }
    } catch (edgeErr: any) {
      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to redeem invite code');
      }
      throw edgeErr;
    }

    throw new Error('Could not redeem invite code. Please check your link or try again.');
  }

  /**
   * Fetches all members of a household.
   */
  async getMembers(householdId: string): Promise<HouseholdMember[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('household_members')
      .select('*')
      .eq('household_id', householdId);

    if (error || !data) {
      console.error('Failed to get household members:', error);
      return [];
    }

    return data as HouseholdMember[];
  }

  /**
   * Removes a member from a household (Owner only).
   */
  async removeMember(householdId: string, userId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message || 'Failed to remove member');
    }
  }

  /**
   * Leave current household (for members and owners).
   * Uses Postgres RPC leave_household with direct table fallback.
   */
  async leaveHousehold(householdId: string, userId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    // 1. Try RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('leave_household', {
      p_household_id: householdId,
    });

    if (!rpcError && rpcData) {
      if (typeof rpcData === 'object' && 'error' in rpcData && rpcData.error) {
        throw new Error(String(rpcData.error));
      }
      return;
    }

    // 2. Direct fallback
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message || 'Failed to leave household');
    }
  }

  /**
   * Revokes all pending (not yet redeemed) invites for a household.
   * Uses Postgres RPC revoke_household_invites with direct fallback.
   */
  async revokeAllPendingInvites(householdId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    // 1. Try RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('revoke_household_invites', {
      p_household_id: householdId,
    });

    if (!rpcError && rpcData) {
      if (typeof rpcData === 'object' && 'error' in rpcData && rpcData.error) {
        throw new Error(String(rpcData.error));
      }
      return;
    }

    // 2. Direct fallback
    const { error } = await supabase
      .from('household_invites')
      .delete()
      .eq('household_id', householdId)
      .is('used_by', null);

    if (error) {
      throw new Error(error.message || 'Failed to revoke pending invites');
    }
  }
}

export const householdRepository = new HouseholdRepository();

