import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizePhoneNumber } from '@/lib/sms/termii';

/** Who paid into a collection (#1194): a resident, or a non-resident named on the payment. */
export const payerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resident'), resident_id: z.guid() }),
  z.object({
    kind: z.literal('non_resident'),
    full_name: z.string().trim().min(1, 'Enter the payer name').max(120),
    phone: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
    email: z.email('Enter a valid email').optional().nullable().or(z.literal('')).transform((value) => value || null),
  }),
]);

export type PayerInput = z.output<typeof payerSchema>;

/** A resident's payer row, or a non-resident's: reused when the phone or email matches an earlier payer. */
export async function findOrCreatePayer(
  client: SupabaseClient,
  payer: PayerInput,
  userId: string
): Promise<{ id: string; isResident: boolean } | { error: string }> {
  if (payer.kind === 'resident') {
    const { data: resident, error: residentError } = await client.from('residents').select('id').eq('id', payer.resident_id).maybeSingle();
    if (residentError) return { error: residentError.message };
    if (!resident) return { error: 'Resident not found' };
    const { data: existing, error: existingError } = await client.from('collection_payers').select('id').eq('resident_id', payer.resident_id).maybeSingle();
    if (existingError) return { error: existingError.message };
    if (existing) return { id: existing.id, isResident: true };
    const { data, error } = await client
      .from('collection_payers')
      .insert({ resident_id: payer.resident_id, created_by: userId })
      .select('id')
      .single();
    return error || !data ? { error: error?.message ?? 'Could not record the payer' } : { id: data.id, isResident: true };
  }

  const phone = payer.phone ? normalizePhoneNumber(payer.phone) : null;
  const email = payer.email?.toLowerCase() ?? null;
  if (phone || email) {
    const filters = [phone && `phone.eq.${phone}`, email && `email.eq.${email}`].filter(Boolean).join(',');
    const { data: existing, error } = await client.from('collection_payers').select('id').is('resident_id', null).or(filters).limit(1);
    if (error) return { error: error.message };
    if (existing?.[0]) return { id: existing[0].id, isResident: false };
  }
  const { data, error } = await client
    .from('collection_payers')
    .insert({ full_name: payer.full_name, phone, email, created_by: userId })
    .select('id')
    .single();
  return error || !data ? { error: error?.message ?? 'Could not record the payer' } : { id: data.id, isResident: false };
}
