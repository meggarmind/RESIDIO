'use server';

import { createHash, randomInt } from 'node:crypto';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { parseWhatsAppOptInImport } from '@/lib/whatsapp/admin-import';

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

type OptInImportResult = {
  imported: number;
  duplicates: number;
  errors: string[];
};

export async function importWhatsAppOptIns(
  csv: string
): Promise<ActionResult<OptInImportResult>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const result: OptInImportResult = { imported: 0, duplicates: 0, errors: [] };

  const parsed = parseWhatsAppOptInImport(csv);
  result.errors.push(...parsed.errors.map(({ line, error }) => `Line ${line}: ${error}`));

  if (parsed.rows.length === 0) {
    return { success: true, data: result, error: null };
  }

  const codes = [...new Set(parsed.rows.map((row) => row.residentCode))];
  const { data: residents, error: residentError } = await adminClient
    .from('residents')
    .select('id, resident_code')
    .in('resident_code', codes);

  if (residentError) {
    return { success: false, data: null, error: 'Failed to look up resident codes.' };
  }

  const residentByCode = new Map(residents?.map((r) => [r.resident_code, r.id]) ?? []);
  const existingIds = new Set<string>();
  const residentIds = [...new Set(residents?.map((r) => r.id) ?? [])];

  if (residentIds.length > 0) {
    const { data: existing, error: existingError } = await adminClient
      .from('whatsapp_optins')
      .select('resident_id')
      .in('resident_id', residentIds);
    if (existingError) {
      return { success: false, data: null, error: 'Failed to check existing WhatsApp opt-ins.' };
    }
    existing?.forEach((optin) => existingIds.add(optin.resident_id));
  }

  const insertedIds = new Set<string>();
  const now = new Date().toISOString();

  for (const { residentCode, phoneNumber } of parsed.rows) {
    const residentId = residentByCode.get(residentCode);
    if (!residentId) {
      result.errors.push(`Unknown resident code: ${residentCode}`);
      continue;
    }
    if (existingIds.has(residentId) || insertedIds.has(residentId)) {
      result.duplicates += 1;
      continue;
    }
    const { error } = await adminClient.from('whatsapp_optins').insert({
      resident_id: residentId,
      phone_number: phoneNumber,
      opted_in: true,
      source: 'admin_import',
      opted_in_at: now,
    });
    if (error) {
      result.errors.push(`Failed to import ${residentCode}: ${error.message}`);
      continue;
    }
    insertedIds.add(residentId);
    result.imported += 1;
  }

  if (result.imported > 0) {
    await logAudit({
      action: 'CREATE',
      entityType: 'whatsapp_optins',
      entityId: 'bulk-import',
      entityDisplay: `WhatsApp opt-in bulk import`,
      newValues: { imported: result.imported, duplicates: result.duplicates, errors: result.errors.length },
    });
    revalidatePath('/settings/whatsapp');
  }

  return { success: true, data: result, error: null };
}

export async function updateWhatsAppPendingContact(input: {
  phoneNumber: string;
  status: 'attached' | 'ignored';
  residentId?: string;
}): Promise<ActionResult<null>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: contact, error: contactError } = await adminClient
    .from('whatsapp_pending_contacts')
    .select('id, phone_number, status, resident_id')
    .eq('phone_number', input.phoneNumber)
    .eq('status', 'pending')
    .maybeSingle();

  if (contactError || !contact) {
    return { success: false, data: null, error: 'No pending WhatsApp contact found for that number.' };
  }

  if (input.status === 'attached') {
    if (!input.residentId) {
      return { success: false, data: null, error: 'A resident ID is required to attach a pending contact.' };
    }
    const { data: resident, error: residentError } = await adminClient
      .from('residents')
      .select('id')
      .eq('id', input.residentId)
      .maybeSingle();
    if (residentError || !resident) {
      return { success: false, data: null, error: 'Resident not found.' };
    }
  }

  const { error } = await adminClient
    .from('whatsapp_pending_contacts')
    .update({
      status: input.status,
      resident_id: input.status === 'attached' ? input.residentId : null,
    })
    .eq('id', contact.id);

  if (error) {
    return { success: false, data: null, error: 'Failed to update WhatsApp pending contact.' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'whatsapp_pending_contacts',
    entityId: contact.id,
    entityDisplay: `WhatsApp pending contact ${input.phoneNumber}`,
    oldValues: { status: contact.status, resident_id: contact.resident_id },
    newValues: { status: input.status, resident_id: input.status === 'attached' ? input.residentId : null },
  });
  revalidatePath('/settings/whatsapp');

  return { success: true, data: null, error: null };
}

export async function resetWhatsAppSession(phoneNumber: string): Promise<ActionResult<null>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: session, error: readError } = await adminClient
    .from('whatsapp_sessions')
    .select('id, resident_id')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (readError) {
    return { success: false, data: null, error: 'Failed to look up WhatsApp session.' };
  }

  if (session) {
    const { error } = await adminClient.from('whatsapp_sessions').delete().eq('id', session.id);
    if (error) {
      return { success: false, data: null, error: 'Failed to reset WhatsApp session.' };
    }

    await logAudit({
      action: 'DELETE',
      entityType: 'whatsapp_sessions',
      entityId: session.id,
      entityDisplay: `WhatsApp session reset for ${phoneNumber}`,
      oldValues: { phone_number: phoneNumber, resident_id: session.resident_id },
    });
    revalidatePath('/settings/whatsapp');
  }

  return { success: true, data: null, error: null };
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
    .select('id, phone_number, status, source, resident_id, first_seen_at, last_seen_at, created_at, updated_at, resident:residents(first_name, last_name, resident_code)')
    .order('last_seen_at', { ascending: false });

  return {
    success: !error,
    data: data || [],
    error: error?.message || null,
  };
}

export async function getWhatsAppForcePin(): Promise<ActionResult<boolean>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const { data, error } = await createAdminClient()
    .from('system_settings')
    .select('value')
    .eq('key', 'whatsapp_force_pin')
    .maybeSingle();

  return {
    success: !error,
    data: data?.value === true || data?.value === 'true',
    error: error?.message || null,
  };
}

export async function setWhatsAppForcePin(enabled: boolean): Promise<ActionResult<boolean>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: oldSetting } = await adminClient
    .from('system_settings')
    .select('value')
    .eq('key', 'whatsapp_force_pin')
    .maybeSingle();
  const { error } = await adminClient
    .from('system_settings')
    .update({ value: enabled.toString() })
    .eq('key', 'whatsapp_force_pin');

  if (error) {
    return { success: false, data: null, error: 'Failed to update WhatsApp PIN policy' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: 'whatsapp_force_pin',
    entityDisplay: 'WhatsApp force-PIN policy',
    oldValues: { value: oldSetting?.value },
    newValues: { value: enabled },
  });
  revalidatePath('/settings/whatsapp');

  return { success: true, data: enabled, error: null };
}
