/**
 * One-off backfill for #455: encrypt legacy plaintext TOTP secrets in
 * profiles.two_factor_secret_encrypted (AES-256-GCM via src/lib/encryption.ts).
 *
 * Dry run by default (reports counts only, never prints secrets):
 *   npx tsx scripts/reencrypt-totp-secrets.ts
 * Apply:
 *   npx tsx scripts/reencrypt-totp-secrets.ts --apply
 *
 * Needs DATA_ENCRYPTION_KEY (or GMAIL_TOKEN_ENCRYPTION_KEY) and the cloud
 * service-role config in .env.local. Aim it at one database at a time.
 * Idempotent: values that are not plaintext base32 are skipped.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../src/lib/encryption';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');

const apply = process.argv.includes('--apply');
const PLAINTEXT_TOTP = /^[A-Z2-7]{16,32}=*$/;

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, two_factor_secret_encrypted')
    .not('two_factor_secret_encrypted', 'is', null);
  if (error) throw error;

  const legacy = (data ?? []).filter((r) => PLAINTEXT_TOTP.test(r.two_factor_secret_encrypted as string));
  console.log(`${data?.length ?? 0} profiles hold a 2FA secret; ${legacy.length} are legacy plaintext.`);

  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to encrypt them.');
    return;
  }

  let done = 0;
  for (const row of legacy) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ two_factor_secret_encrypted: encrypt(row.two_factor_secret_encrypted as string) })
      .eq('id', row.id)
      .eq('two_factor_secret_encrypted', row.two_factor_secret_encrypted as string);
    if (updateError) {
      console.error(`Failed for profile ${row.id}:`, updateError.message);
      continue;
    }
    done++;
  }
  console.log(`Encrypted ${done} of ${legacy.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
