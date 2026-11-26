// ─────────────────────────────────────────────────────────────────
// Livo — Agent Portal (Supabase RPC wrappers).
//
// Coin agents send coins to users by display ID. The agents /
// agent_transactions tables are owner-only under RLS, so the app
// can NEVER read them with the anon key — every call below goes
// through a SECURITY DEFINER Postgres function:
//   agent_portal_info()     — is the caller an (approved) agent?
//   agent_resolve_user(id)  — preview a recipient's name by ID
//   agent_send_coins(id, n) — atomic agent-wallet debit + user
//                             credit + agent_transactions row
//   agent_my_transactions() — the caller's sent transfers
// No client-side cross-user writes anywhere: the money moves
// inside agent_send_coins only. A send RPC timeout returns
// 'update-failed' WITHOUT retrying — the server may already have
// applied it, and a second call would double-send (same rule as
// adjustWallet in wallet.js).
// ─────────────────────────────────────────────────────────────────
import { supabase } from './client';
import { withTimeout } from './timeout';

const EMPTY_INFO = { isAgent: false, status: null, walletCoins: 0, agentName: null, agentId: null };

// Is the signed-in user an agent? Never throws — any failure
// (not signed in, RPC missing, timeout) reports "not an agent",
// so the Agent Portal menu entry simply stays hidden.
export async function getAgentPortalInfo() {
  if (!supabase) return EMPTY_INFO;
  try {
    const res = await withTimeout(supabase.rpc('agent_portal_info'));
    if (!res || res.error || !Array.isArray(res.data) || res.data.length === 0) return EMPTY_INFO;
    const row = res.data[0];
    return {
      isAgent: row.is_agent === true,
      status: typeof row.status === 'string' ? row.status : null,
      walletCoins: typeof row.wallet_coins === 'number' ? row.wallet_coins : 0,
      agentName: typeof row.agent_name === 'string' ? row.agent_name : null,
      agentId: typeof row.agent_id === 'string' ? row.agent_id : null,
    };
  } catch (e) {
    return EMPTY_INFO;
  }
}

// Recipient preview: { userId, username } or null when the ID
// does not exist. Only approved agents can call it (the RPC
// raises 'not-an-agent' otherwise) — that also returns null here.
export async function resolveAgentUser(userId) {
  const id = String(userId || '').trim();
  if (!id || !supabase) return null;
  try {
    const res = await withTimeout(supabase.rpc('agent_resolve_user', { p_user_id: id }));
    if (!res || res.error || !Array.isArray(res.data) || res.data.length === 0) return null;
    const row = res.data[0];
    return {
      userId: typeof row.user_id === 'string' ? row.user_id : id,
      username: typeof row.username === 'string' ? row.username : '',
    };
  } catch (e) {
    return null;
  }
}

// Send coins to a user by display ID. Returns
// { walletCoins, recipientCoins } on success, or { error }:
//   'invalid-amount' | 'not-an-agent' | 'not-approved' |
//   'insufficient-balance' | 'user-not-found' |
//   'cannot-send-to-self' | 'update-failed' | 'send-failed'.
// A timeout (null) is 'update-failed' with NO retry.
export async function sendAgentCoins(recipientUserId, coins) {
  const amount = Math.floor(Number(coins));
  if (!recipientUserId || !amount || amount <= 0) return { error: 'invalid-amount' };
  if (!supabase) return { error: 'send-failed' };
  const res = await withTimeout(
    supabase.rpc('agent_send_coins', { p_recipient_user_id: String(recipientUserId).trim(), p_coins: amount }),
  );
  if (res === null) return { error: 'update-failed' };
  if (res.error) {
    const msg = String((res.error && res.error.message) || '');
    if (/insufficient-balance/i.test(msg)) return { error: 'insufficient-balance' };
    if (/user-not-found/i.test(msg)) return { error: 'user-not-found' };
    if (/not-approved/i.test(msg)) return { error: 'not-approved' };
    if (/not-an-agent/i.test(msg)) return { error: 'not-an-agent' };
    if (/invalid-amount/i.test(msg)) return { error: 'invalid-amount' };
    if (/cannot-send-to-self/i.test(msg)) return { error: 'cannot-send-to-self' };
    return { error: 'send-failed' };
  }
  if (!Array.isArray(res.data) || res.data.length === 0) return { error: 'send-failed' };
  const row = res.data[0];
  return {
    walletCoins: typeof row.wallet_coins === 'number' ? row.wallet_coins : 0,
    recipientCoins: typeof row.recipient_coins === 'number' ? row.recipient_coins : 0,
  };
}

// The caller's sent transfers, newest first (max 50). Empty
// array when not an agent or on any failure.
export async function fetchAgentTransactions() {
  if (!supabase) return [];
  try {
    const res = await withTimeout(supabase.rpc('agent_my_transactions'));
    if (!res || res.error || !Array.isArray(res.data)) return [];
    return res.data.map((r) => ({
      id: r.id,
      userId: r.user_id || '',
      username: r.username || '',
      coins: typeof r.coins === 'number' ? r.coins : 0,
      kind: r.kind || 'recharge',
      method: r.method || '',
      createdAt: r.created_at,
    }));
  } catch (e) {
    return [];
  }
}
