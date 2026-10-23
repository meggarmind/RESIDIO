import { createHash, randomInt } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/server';

export type WhatsAppCodePurpose = 'link' | 'pin_setup';

/** A code issued by a sponsor in the Assistant for one of their co-residents (#1072). */
export interface CodeIssuer {
  residentId: string;
  houseId: string;
}

export interface IssuedCode {
  id: string;
  code: string;
  expiresAt: string;
}

/**
 * Inserts a single-use 6-digit code into whatsapp_link_tokens and returns the plaintext once; only its
 * hash is stored. With `supersede`, the resident's other live codes of the same purpose are cancelled
 * first. Callers authorize and audit; null means nothing was issued.
 */
export async function insertWhatsAppCode(
  adminClient: ReturnType<typeof createAdminClient>,
  input: {
    residentId: string;
    purpose: WhatsAppCodePurpose;
    ttlMinutes: number;
    createdBy: string | null | undefined;
    supersede: boolean;
    issuer?: CodeIssuer;
  }
): Promise<IssuedCode | null> {
  if (input.supersede) {
    const { error: supersedeError } = await adminClient
      .from('whatsapp_link_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('resident_id', input.residentId)
      .filter('purpose', 'eq', input.purpose)
      .is('used_at', null);
    if (supersedeError) return null;
  }

  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000).toISOString();
  // The generated types do not know purpose (#890) or the issuer columns (#1072) until those migrations are applied.
  const { data: token, error } = await adminClient
    .from('whatsapp_link_tokens')
    .insert({
      resident_id: input.residentId,
      token_hash: createHash('sha256').update(code).digest('hex'),
      expires_at: expiresAt,
      created_by: input.createdBy,
      purpose: input.purpose,
      ...(input.issuer ? { issued_by_resident_id: input.issuer.residentId, house_id: input.issuer.houseId } : {}),
    } as never)
    .select('id')
    .single<{ id: string }>();

  if (error || !token) return null;
  return { id: token.id, code, expiresAt };
}
