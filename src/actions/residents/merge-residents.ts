'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Merge residents (#988, action half of #821). The database functions do the work and re-check
 * every blocker inside their locks (supabase/migrations/20261024100100_resident_merge_functions.sql,
 * contract in docs/features/resident-merge.md). They check auth.uid(), so they are called with the
 * signed-in admin's session client, never the service role.
 */

export type ResidentMergeBlocker = { code: string; message: string; detail: unknown };

export type ResidentMergeSide = {
  id: string;
  resident_code: string;
  name: string;
  entity_type: string;
  account_status: string;
  has_login: boolean;
  has_whatsapp_pin: boolean;
};

export type ResidentMergeContact = {
  email: string | null;
  email_verified_at: string | null;
  phone_primary: string | null;
  phone_verified_at: string | null;
  phone_secondary: string | null;
};

export type ResidentMergePreview = {
  kept_resident_id: string;
  duplicate_resident_id: string;
  can_merge: boolean;
  blockers: ResidentMergeBlocker[];
  warnings?: {
    possible_duplicate_payments: Array<{ kept_payment_id: string; duplicate_payment_id: string; amount: number; payment_date: string }>;
    overlapping_invoices: Array<{ kept_invoice_id: string; duplicate_invoice_id: string; house_id: string }>;
  };
  kept?: ResidentMergeSide;
  duplicate?: ResidentMergeSide;
  contact?: {
    kept: ResidentMergeContact;
    duplicate: ResidentMergeContact;
    suggest_duplicate_phone_as_secondary: boolean;
  };
  counts?: Record<string, number>;
  folds?: Record<string, number>;
  replaced_kept_rows?: { resident_houses: number };
  wallets?: { kept_balance: number; duplicate_balance: number; combined_balance: number; duplicate_has_wallet: boolean };
  account_balances?: { kept_closing_balance: number; duplicate_closing_balance: number; combined_closing_balance: number };
};

export type ResidentMergeResult = {
  merge_id: string;
  kept_resident_id: string;
  merged_resident_id: string;
  moved: Record<string, number>;
  folded: Record<string, number>;
  replaced_kept_rows: { resident_houses: number };
  contact: ResidentContactChoices;
  wallet: { combined: boolean; kept_balance_before: number; duplicate_balance_before: number; kept_balance_after: number };
  account_balance: { kept_closing_before: number; duplicate_closing_before: number; kept_closing_after: number };
  whatsapp_pin_cleared: boolean;
  kept_has_whatsapp_pin: boolean;
};

const pairSchema = z
  .object({
    keptId: z.string().uuid('Choose a valid record to keep'),
    duplicateId: z.string().uuid('Choose a valid duplicate record'),
  })
  .refine((v) => v.keptId !== v.duplicateId, { message: 'Choose two different residents' });

// Q2: email and the two phones are chosen field by field; a missing key means the kept record's value.
const contactChoicesSchema = z
  .object({
    email: z.enum(['kept', 'duplicate']).optional(),
    phone_primary: z.enum(['kept', 'duplicate']).optional(),
    phone_secondary: z.enum(['kept', 'duplicate', 'duplicate_phone_primary']).optional(),
  })
  .strict();

export type ResidentContactChoices = z.infer<typeof contactChoicesSchema>;

const mergeSchema = z.object({
  keptId: z.string(),
  duplicateId: z.string(),
  contactChoices: contactChoicesSchema.default({}),
  confirmationCode: z.string().trim().min(1, "Type the kept record's resident code to confirm"),
});

export type MergeResidentsInput = z.input<typeof mergeSchema>;

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string; message: string; details?: string } | null;
  }>;
};

type ResidentLabel = { id: string; first_name: string; last_name: string; resident_code: string; account_status: string };

function describe(r: ResidentLabel) {
  return `${r.first_name} ${r.last_name} (${r.resident_code})`;
}

function rpcErrorMessage(error: { code?: string; message: string }) {
  if (error.code === '42501') return 'You do not have permission to merge residents';
  if (error.message.startsWith('Resident merge invariant failed')) {
    return 'The merge stopped at a safety check and nothing was changed. Report this to support.';
  }
  return error.message;
}

export async function previewResidentMerge(
  keptId: string,
  duplicateId: string
): Promise<{ data: ResidentMergePreview | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_MERGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const parsed = pairSchema.safeParse({ keptId, duplicateId });
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const supabase = (await createServerSupabaseClient()) as unknown as RpcClient;
  const { data, error } = await supabase.rpc('preview_resident_merge', {
    p_kept: parsed.data.keptId,
    p_duplicate: parsed.data.duplicateId,
  });
  if (error) {
    console.error('[previewResidentMerge] preview_resident_merge failed:', error);
    return { data: null, error: rpcErrorMessage(error) };
  }
  return { data: data as ResidentMergePreview, error: null };
}

export async function mergeResidents(
  input: MergeResidentsInput
): Promise<{ data: ResidentMergeResult | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_MERGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const parsedInput = mergeSchema.safeParse(input);
  if (!parsedInput.success) return { data: null, error: parsedInput.error.issues[0].message };
  const pair = pairSchema.safeParse(parsedInput.data);
  if (!pair.success) return { data: null, error: pair.error.issues[0].message };
  const { keptId, duplicateId } = pair.data;
  const { contactChoices, confirmationCode } = parsedInput.data;

  const supabase = await createServerSupabaseClient();
  const { data: rows, error: fetchError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, resident_code, account_status')
    .in('id', [keptId, duplicateId]);
  if (fetchError) {
    console.error('[mergeResidents] resident lookup failed:', fetchError);
    return { data: null, error: 'Could not load the two residents' };
  }
  const kept = (rows as ResidentLabel[] | null)?.find((r) => r.id === keptId);
  const duplicate = (rows as ResidentLabel[] | null)?.find((r) => r.id === duplicateId);
  if (!kept || !duplicate) return { data: null, error: 'One or both residents do not exist' };

  // The typed code is checked against the database, not the client, so the record kept is the one
  // whose code the admin typed.
  if (confirmationCode !== kept.resident_code) {
    return { data: null, error: `Type ${kept.resident_code}, the resident code of the record to keep, to confirm` };
  }

  const { data, error } = await (supabase as unknown as RpcClient).rpc('merge_residents', {
    p_kept: keptId,
    p_duplicate: duplicateId,
    p_contact_choices: contactChoices,
  });
  if (error || !data) {
    console.error('[mergeResidents] merge_residents failed:', error);
    return { data: null, error: error ? rpcErrorMessage(error) : 'The merge returned no result' };
  }
  const result = data as ResidentMergeResult;

  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: kept.id,
    entityDisplay: describe(kept),
    newValues: {
      merge_id: result.merge_id,
      merged_resident_id: duplicate.id,
      moved: result.moved,
      folded: result.folded,
      contact: result.contact,
    },
    description: `Merged duplicate ${describe(duplicate)} into this resident`,
  });
  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: duplicate.id,
    entityDisplay: describe(duplicate),
    oldValues: { account_status: duplicate.account_status, merged_into_resident_id: null },
    newValues: { account_status: 'archived', merged_into_resident_id: kept.id, merge_id: result.merge_id },
    description: `Merged into ${describe(kept)} and archived`,
  });

  revalidatePath('/residents');
  revalidatePath(`/residents/${kept.id}`);
  revalidatePath(`/residents/${duplicate.id}`);
  return { data: result, error: null };
}
