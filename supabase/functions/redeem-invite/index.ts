// supabase/functions/redeem-invite/index.ts
//
// Supabase Edge Function — runs with the service role key so it can bypass RLS
// to insert a household_member row for a user who isn't yet a member.
//
// Deploy with: supabase functions deploy redeem-invite
//
// The client calls this endpoint with:
//   POST /functions/v1/redeem-invite
//   Authorization: Bearer <user JWT>
//   Body: { "invite_code": "abc123" }
//
// Returns:
//   { "household_id": "...", "household_name": "..." }  on success
//   { "error": "..." }  on failure

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Parse & validate request ────────────────────────────────────────────
    const { invite_code } = await req.json() as { invite_code?: string };
    if (!invite_code || typeof invite_code !== 'string') {
      return json({ error: 'invite_code is required' }, 400);
    }

    // ── 2. Authenticate the calling user ───────────────────────────────────────
    // The user must already be logged in (magic-link completed).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Authorization header required' }, 401);
    }

    // Supabase project credentials from the Edge Function runtime environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create a client with the service role key (bypasses RLS — used carefully below)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the user JWT and extract their ID
    const { data: { user }, error: userError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }
    const userId = user.id;

    // ── 3. Look up the invite ───────────────────────────────────────────────────
    const { data: invite, error: inviteError } = await adminClient
      .from('household_invites')
      .select('id, household_id, expires_at, used_by')
      .eq('invite_code', invite_code.trim())
      .single();

    if (inviteError || !invite) {
      return json({ error: 'Invite code not found' }, 404);
    }

    // Check not expired
    if (new Date(invite.expires_at) < new Date()) {
      return json({ error: 'This invite link has expired' }, 410);
    }

    // Check not already used
    if (invite.used_by !== null) {
      return json({ error: 'This invite has already been used' }, 409);
    }

    // ── 4. Check if user is already a member ───────────────────────────────────
    const { data: existingMember } = await adminClient
      .from('household_members')
      .select('id')
      .eq('household_id', invite.household_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMember) {
      // Already a member — idempotent success, no duplicate insert
      const { data: household } = await adminClient
        .from('households')
        .select('id, name')
        .eq('id', invite.household_id)
        .single();
      return json({ household_id: household?.id, household_name: household?.name });
    }

    // ── 5. Check if user is already in a DIFFERENT household ───────────────────
    // Current constraint: one household per user. Reject if already in another.
    const { data: otherMembership } = await adminClient
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (otherMembership) {
      return json({
        error: 'You are already a member of a household. Leave your current household first.',
      }, 409);
    }

    // ── 6. Atomic: add member + mark invite used ────────────────────────────────
    // Run both inside a transaction-like sequence. If member insert fails,
    // we don't mark the invite as used.

    const { error: memberError } = await adminClient
      .from('household_members')
      .insert({
        household_id: invite.household_id,
        user_id: userId,
        role: 'member',
      });

    if (memberError) {
      console.error('Failed to insert household_member:', memberError);
      return json({ error: 'Failed to join household. Please try again.' }, 500);
    }

    // Mark invite as used
    await adminClient
      .from('household_invites')
      .update({ used_by: userId })
      .eq('id', invite.id);

    // ── 7. Return the household details ────────────────────────────────────────
    const { data: household, error: householdError } = await adminClient
      .from('households')
      .select('id, name')
      .eq('id', invite.household_id)
      .single();

    if (householdError) {
      return json({ error: 'Joined household but failed to retrieve details' }, 500);
    }

    return json({
      household_id: household.id,
      household_name: household.name,
    });
  } catch (err) {
    console.error('Unhandled error in redeem-invite:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
