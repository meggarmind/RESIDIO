'use server';

import { createHash, randomInt } from 'node:crypto';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';

type ActionResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type LinkToken = {
  code: string;
  expiresAt: string;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createWhatsAppLinkToken(
  residentId: string
): Promise<ActionResult<LinkToken>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: resident, error: residentError } = await adminClient
    .from('residents')
    .select('id, first_name, last_name')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, data: null, error: 'Resident not found' };
  }

  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: token, error: tokenError } = await adminClient
    .from('whatsapp_link_tokens')
    .insert({
      resident_id: residentId,
      token_hash: hashToken(code),
      expires_at: expiresAt,
      created_by: authorization.userId,
    })
    .select('id')
    .single();

  if (tokenError || !token) {
    return { success: false, data: null, error: 'Failed to create WhatsApp link code' };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'whatsapp_link_tokens',
    entityId: token.id,
    entityDisplay: `WhatsApp link code for ${resident.first_name} ${resident.last_name}`,
    newValues: { resident_id: residentId, expires_at: expiresAt },
  });

  return { success: true, data: { code, expiresAt }, error: null };
}

export async function getWhatsAppOptIns(): Promise<ActionResult<unknown[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('whatsapp_optins')
    .select('id, resident_id, phone_number, opted_in, source, opted_in_at, opted_out_at, created_at, updated_at, resident:residents(first_name, last_name, resident_code)')
    .order('updated_at', { ascending: false });

  return {
    success: !error,
    data: data || [],
    error: error?.message || null,
  };
}

export async function getWhatsAppPendingContacts(): Promise<ActionResult<unknown[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('whatsapp_pending_contacts')
    .select('id, phone_number, status, resident_id, first_seen_at, last_seen_at, created_at, updated_at, resident:residents(first_name, last_name, resident_code)')
    .order('last_seen_at', { ascending: false });

  return {
    success: !error,
    data: data || [],
    error: error?.message || null,
  };
}
