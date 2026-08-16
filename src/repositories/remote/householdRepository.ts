import { supabase } from '../../lib/supabaseClient';
import type { Household, HouseholdMember, HouseholdInvite } from '../../types/database';

export class HouseholdRepository {
  /**
   * Creates a new household and inserts the creator as the 'owner' member.
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
   * Invokes the redeem-invite Edge Function (with fallback to RPC/query if in dev).
   */
  async redeemInvite(inviteCode: string): Promise<{ householdId: string; householdName: string }> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const code = inviteCode.trim();

    // Call Supabase Edge function
    const { data, error } = await supabase.functions.invoke('redeem-invite', {
      body: { invite_code: code },
    });

    if (error) {
      throw new Error(error.message || 'Failed to redeem invite code');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      householdId: data.household_id,
      householdName: data.household_name,
    };
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
   * Leave current household (for non-owner members).
   */
  async leaveHousehold(householdId: string, userId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message || 'Failed to leave household');
    }
  }
}

export const householdRepository = new HouseholdRepository();
