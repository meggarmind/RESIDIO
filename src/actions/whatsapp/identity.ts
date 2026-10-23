'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { parseWhatsAppOptInImport } from '@/lib/whatsapp/admin-import';
import { PRIVACY_NOTICE_TEXT_KEY, PRIVACY_NOTICE_VERSION_KEY } from '@/lib/whatsapp/privacy-notice';
import { sendWhatsAppPinAlert } from '@/lib/whatsapp/pin-alert';
import { insertWhatsAppCode, type WhatsAppCodePurpose } from '@/lib/whatsapp/link-codes';

type ActionResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type LinkToken = {
  code: string;
  expiresAt: string;
};

/** Minutes a code is valid: link codes keep their 15, PIN setup codes get 10 (#805). */
const CODE_TTL_MINUTES: Record<WhatsAppCodePurpose, number> = { link: 15, pin_setup: 10 };

type Resident = { id: string; first_name: string; last_name: string };
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Inserts a single-use code and audits it. The plaintext code is returned once and is never
 * stored or audited; only its hash is stored. Callers have already authorized.
 */
async function issueCode(
  adminClient: AdminClient,
  resident: Resident,
  purpose: WhatsAppCodePurpose,
  userId: string | null | undefined
): Promise<ActionResult<LinkToken>> {
  // One live setup code per resident, so its wrong-try count and pause (slice C) cannot be
  // sidestepped by guessing against an older code.
  const token = await insertWhatsAppCode(adminClient, {
    residentId: resident.id,
    purpose,
    ttlMinutes: CODE_TTL_MINUTES[purpose],
    createdBy: userId,
    supersede: purpose === 'pin_setup',
  });

  if (!token) {
    return {
      success: false,
      data: null,
      error: purpose === 'link' ? 'Failed to create WhatsApp link code' : 'Failed to create WhatsApp setup code',
    };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'whatsapp_link_tokens',
    entityId: token.id,
    entityDisplay: `WhatsApp ${purpose === 'link' ? 'link' : 'PIN setup'} code for ${resident.first_name} ${resident.last_name}`,
    newValues: { resident_id: resident.id, purpose, expires_at: token.expiresAt },
  });

  return { success: true, data: { code: token.code, expiresAt: token.expiresAt }, error: null };
}

export async function createWhatsAppLinkToken(
  residentId: string,
  purpose: WhatsAppCodePurpose = 'link'
): Promise<ActionResult<LinkToken>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  if (!Object.hasOwn(CODE_TTL_MINUTES, purpose)) {
    return { success: false, data: null, error: 'Unknown code purpose' };
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

  return issueCode(adminClient, resident, purpose, authorization.userId);
}

/**
 * Clears a resident's WhatsApp PIN and lock, signs their sessions out of the PIN, and issues a
 * PIN setup code returned once (#805, #890). The admin must confirm identity first.
 */
export async function resetWhatsAppPin(residentId: string): Promise<ActionResult<LinkToken>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: resident, error: residentError } = await adminClient
    .from('residents')
    .select('id, first_name, last_name')
    .eq('id', residentId)
    .maybeSingle();

  if (residentError || !resident) {
    return { success: false, data: null, error: 'Resident not found' };
  }

  // The generated types do not know the #850 and #891 lock columns until those migrations are applied.
  const { error: pinError } = await adminClient
    .from('residents')
    .update({
      whatsapp_pin_hash: null,
      whatsapp_pin_set_at: null,
      whatsapp_pin_failed_attempts: 0,
      whatsapp_pin_locked_until: null,
      whatsapp_pin_failed_at: [],
      whatsapp_pin_hard_locked_at: null,
    } as never)
    .eq('id', residentId);

  if (pinError) {
    return { success: false, data: null, error: 'Failed to reset WhatsApp PIN.' };
  }

  // A session verified with the old PIN must not stay unlocked, nor finish a PIN change begun with it.
  // The generated types do not know pending_pin_hash (#892) until that migration is applied.
  const { error: sessionError } = await adminClient
    .from('whatsapp_sessions')
    .update({ pin_authenticated: false, current_node: 'menu', pending_pin_hash: null } as never)
    .eq('resident_id', residentId);

  // Never record the hash: the audit says only that it was cleared.
  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: residentId,
    entityDisplay: `WhatsApp PIN reset for ${resident.first_name} ${resident.last_name}`,
    newValues: {
      whatsapp_pin: 'cleared',
      whatsapp_pin_failed_attempts: 0,
      whatsapp_pin_locked_until: null,
      whatsapp_pin_failed_at: [],
      whatsapp_pin_hard_locked_at: null,
      whatsapp_sessions_pin_authenticated: sessionError ? 'not cleared' : false,
    },
  });
  revalidatePath('/settings/whatsapp');

  try {
    await sendWhatsAppPinAlert(residentId, 'reset');
  } catch (error) {
    // The PIN is already cleared; a failed alert email must not fail the reset.
    console.error('[whatsapp] PIN reset alert email failed:', error instanceof Error ? error.message : 'unknown error');
  }

  if (sessionError) {
    return { success: false, data: null, error: 'PIN cleared, but open WhatsApp sessions could not be signed out. Try again.' };
  }

  const issued = await issueCode(adminClient, resident, 'pin_setup', authorization.userId);
  if (!issued.success) {
    return { ...issued, error: 'PIN cleared, but the setup code could not be created. Issue a setup code.' };
  }
  return issued;
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
      .in('resident_id', residentIds)
      .is('deactivated_at', null);
    if (existingError) {
      return { success: false, data: null, error: 'Failed to check existing WhatsApp opt-ins.' };
    }
    existing?.forEach((optin) => existingIds.add(optin.resident_id));
  }

  const insertedIds = new Set<string>();
  const optinRowIds: string[] = [];
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
    const { data: optin, error } = await adminClient.from('whatsapp_optins').upsert({
      resident_id: residentId,
      phone_number: phoneNumber,
      opted_in: true,
      source: 'admin_import',
      opted_in_at: now,
      opted_out_at: null,
      deactivated_at: null,
      updated_at: now,
    }, { onConflict: 'resident_id,phone_number' }).select('id').single();
    if (error) {
      result.errors.push(`Failed to import ${residentCode}: ${error.message}`);
      continue;
    }
    insertedIds.add(residentId);
    if (optin?.id) optinRowIds.push(optin.id);
    result.imported += 1;
  }

  if (result.imported > 0) {
    // audit_logs.entity_id is a uuid: the first created opt-in row stands for the import (#594).
    if (optinRowIds.length > 0) {
      await logAudit({
        action: 'CREATE',
        entityType: 'whatsapp_optins',
        entityId: optinRowIds[0],
        entityDisplay: `WhatsApp opt-in bulk import`,
        newValues: {
          batch: 'bulk-import',
          total_count: result.imported,
          optin_ids: optinRowIds.slice(0, 50),
          imported: result.imported,
          duplicates: result.duplicates,
          errors: result.errors.length,
        },
      });
    }
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
    .select('id, resident_id, phone_number, opted_in, source, opted_in_at, opted_out_at, deactivated_at, link_verified_at, created_at, updated_at, resident:residents(first_name, last_name, resident_code)')
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
    // Absent row means the default, which is on (#850).
    data: !data || data.value === true || data.value === 'true',
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
  const { data: updatedRows, error } = await adminClient
    .from('system_settings')
    .update({ value: enabled.toString() })
    .eq('key', 'whatsapp_force_pin')
    .select('id');

  if (error) {
    return { success: false, data: null, error: 'Failed to update WhatsApp PIN policy' };
  }

  // audit_logs.entity_id is a uuid: use the settings row id; the key goes in newValues (#594).
  if (updatedRows?.[0]?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: updatedRows[0].id,
      entityDisplay: 'WhatsApp force-PIN policy',
      oldValues: { value: oldSetting?.value },
      newValues: { key: 'whatsapp_force_pin', value: enabled },
    });
  }
  revalidatePath('/settings/whatsapp');

  return { success: true, data: enabled, error: null };
}

export async function clearWhatsAppDisputedContact(phoneNumber: string): Promise<ActionResult<null>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: contact, error: contactError } = await adminClient
    .from('whatsapp_pending_contacts')
    .select('id, phone_number, status, resident_id')
    .eq('phone_number', phoneNumber)
    .eq('status', 'disputed')
    .maybeSingle();

  if (contactError || !contact) {
    return { success: false, data: null, error: 'No disputed WhatsApp number found.' };
  }

  // Cleared, not deleted: the number gets the identity read-back again on its next message (#871).
  const { error } = await adminClient
    .from('whatsapp_pending_contacts')
    .update({ status: 'cleared', updated_at: new Date().toISOString() })
    .eq('id', contact.id)
    .eq('status', 'disputed');

  if (error) {
    return { success: false, data: null, error: 'Failed to clear the disputed WhatsApp number.' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'whatsapp_pending_contacts',
    entityId: contact.id,
    entityDisplay: `WhatsApp disputed number ${phoneNumber}`,
    oldValues: { status: contact.status, resident_id: contact.resident_id },
    newValues: { status: 'cleared', resident_id: contact.resident_id },
  });
  revalidatePath('/settings/whatsapp');

  return { success: true, data: null, error: null };
}

type PrivacyNoticeSettings = { version: string; text: string };

const MAX_NOTICE_VERSION_LENGTH = 50;
const MAX_NOTICE_TEXT_LENGTH = 20000;

export async function getWhatsAppPrivacyNotice(): Promise<ActionResult<PrivacyNoticeSettings>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const { data, error } = await createAdminClient()
    .from('system_settings')
    .select('key, value')
    .in('key', [PRIVACY_NOTICE_VERSION_KEY, PRIVACY_NOTICE_TEXT_KEY]);

  if (error) {
    return { success: false, data: null, error: 'Failed to load the WhatsApp privacy notice' };
  }

  const value = (key: string) => {
    const row = data?.find((setting) => setting.key === key);
    return typeof row?.value === 'string' ? row.value : '';
  };
  return { success: true, data: { version: value(PRIVACY_NOTICE_VERSION_KEY), text: value(PRIVACY_NOTICE_TEXT_KEY) }, error: null };
}

export async function setWhatsAppPrivacyNotice(input: PrivacyNoticeSettings): Promise<ActionResult<PrivacyNoticeSettings>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const version = input.version.trim();
  const text = input.text.trim();
  if (!version || version.length > MAX_NOTICE_VERSION_LENGTH) {
    return { success: false, data: null, error: `Enter a notice version of 1 to ${MAX_NOTICE_VERSION_LENGTH} characters.` };
  }
  if (!text || text.length > MAX_NOTICE_TEXT_LENGTH) {
    return { success: false, data: null, error: `Enter the notice text (up to ${MAX_NOTICE_TEXT_LENGTH} characters).` };
  }

  const adminClient = createAdminClient();
  const { data: oldRows, error: oldError } = await adminClient
    .from('system_settings')
    .select('key, value')
    .in('key', [PRIVACY_NOTICE_VERSION_KEY, PRIVACY_NOTICE_TEXT_KEY]);
  if (oldError) {
    return { success: false, data: null, error: 'Failed to load the WhatsApp privacy notice' };
  }
  const old = (key: string) => oldRows?.find((row) => row.key === key)?.value;
  const storedText = old(PRIVACY_NOTICE_TEXT_KEY);
  if (old(PRIVACY_NOTICE_VERSION_KEY) === version && typeof storedText === 'string' && storedText.trim() !== text) {
    return { success: false, data: null, error: 'Change the version when you change the notice text, so residents are asked to accept the new wording.' };
  }
  const { data: savedRows, error } = await adminClient
    .from('system_settings')
    .upsert(
      [
        { key: PRIVACY_NOTICE_VERSION_KEY, value: version, category: 'notifications', description: 'Version of the WhatsApp privacy notice residents accept; changing it re-shows the notice' },
        { key: PRIVACY_NOTICE_TEXT_KEY, value: text, category: 'notifications', description: 'Full text of the WhatsApp privacy notice, sent in the WhatsApp chat' },
      ],
      { onConflict: 'key' }
    )
    .select('id, key');

  if (error) {
    return { success: false, data: null, error: 'Failed to save the WhatsApp privacy notice' };
  }

  // audit_logs.entity_id is a uuid: use the version row's id; both keys go in the values (#594).
  const versionRow = savedRows?.find((row) => row.key === PRIVACY_NOTICE_VERSION_KEY);
  if (versionRow?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: versionRow.id,
      entityDisplay: 'WhatsApp privacy notice',
      oldValues: { version: old(PRIVACY_NOTICE_VERSION_KEY), text: old(PRIVACY_NOTICE_TEXT_KEY) },
      newValues: { version, text },
    });
  }
  revalidatePath('/settings/whatsapp');

  return { success: true, data: { version, text }, error: null };
}
