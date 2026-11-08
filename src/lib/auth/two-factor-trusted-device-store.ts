import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import type { TrustedDevice, TrustedDeviceEvent, TrustedDeviceRepository } from '@/lib/auth/two-factor-trusted-device';
import type { TwoFactorAuditAction } from '@/types/database';

/**
 * Supabase side of "Remember this computer for 30 days" (#1390). The rules are in
 * `two-factor-trusted-device.ts`. Service role only: the table has no client access.
 */

// two_factor_trusted_devices is not in the generated types yet.
const db = () => createAdminClient() as unknown as SupabaseClient;

const COLUMNS = 'id, profile_id, user_agent_summary, created_at, expires_at, last_used_at, revoked_at';

type Row = {
  id: string;
  profile_id: string;
  user_agent_summary: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function toDevice(row: Row): TrustedDevice {
  return {
    id: row.id,
    profileId: row.profile_id,
    userAgentSummary: row.user_agent_summary,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * two_factor_audit_log.action has a CHECK list, so each event is written as the nearest existing
 * action with metadata.event, as the backup-code send and WhatsApp approval events are.
 */
const AUDIT_ACTION: Record<TrustedDeviceEvent, TwoFactorAuditAction> = {
  trusted_device_remembered: 'settings_updated',
  trusted_device_used: 'verified_login',
  trusted_device_forgotten: 'settings_updated',
};

export function createTrustedDeviceRepository(): TrustedDeviceRepository {
  return {
    async insert(input) {
      const { data, error } = await db()
        .from('two_factor_trusted_devices')
        .insert({
          profile_id: input.profileId,
          token_hash: input.tokenHash,
          user_agent_summary: input.userAgentSummary,
          expires_at: input.expiresAt.toISOString(),
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return toDevice(data as Row);
    },

    async findByHash(tokenHash) {
      const { data, error } = await db()
        .from('two_factor_trusted_devices')
        .select(COLUMNS)
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) throw error;
      return data ? toDevice(data as Row) : null;
    },

    async touch(id, now) {
      const { data, error } = await db()
        .from('two_factor_trusted_devices')
        .update({ last_used_at: now.toISOString() })
        .eq('id', id)
        .is('revoked_at', null)
        .gt('expires_at', now.toISOString())
        .select('id');
      if (error) throw error;
      return (data ?? []).length === 1;
    },

    async listLive(profileId, now) {
      const { data, error } = await db()
        .from('two_factor_trusted_devices')
        .select(COLUMNS)
        .eq('profile_id', profileId)
        .is('revoked_at', null)
        .gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Row[]).map(toDevice);
    },

    async revoke(profileId, reason, now, id) {
      let query = db()
        .from('two_factor_trusted_devices')
        .update({ revoked_at: now.toISOString(), revoked_reason: reason })
        .eq('profile_id', profileId)
        .is('revoked_at', null);
      if (id) query = query.eq('id', id);
      const { data, error } = await query.select('id');
      if (error) throw error;
      return (data ?? []).length;
    },

    async logEvent(profileId, event, metadata) {
      const { error } = await db()
        .from('two_factor_audit_log')
        .insert({ profile_id: profileId, action: AUDIT_ACTION[event], metadata: { event, ...metadata } });
      if (error) console.error(`[2FA trusted device] Could not log ${event}:`, error.message);
    },
  };
}
