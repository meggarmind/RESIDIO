/**
 * #1134 — Zod 4's `.uuid()` enforces the RFC 9562 version and variant nibbles. Most ids already
 * stored by Residio do not carry them, so every schema that validated a stored identifier with
 * `.uuid()` rejected the row it was handed. The reported symptom was "Please select a house" on
 * a House control that was already filled and disabled.
 *
 * These tests pin the fix: identifiers read from the database are validated with `z.guid()`,
 * which checks the 8-4-4-4-12 shape and nothing else. `requestKey` in
 * `settle-wallet-invoices.ts` stays on `z.uuid()` deliberately — the client mints it with
 * `crypto.randomUUID()`, so v4 is a real invariant there.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  createResidentBaseSchema,
  createResidentSchema,
  houseAssignmentSchema,
} from '@/lib/validators/resident';
import { houseFormSchema } from '@/lib/validators/house';
import { createSecurityContactSchema } from '@/lib/validators/security-contact';

// A real house id from Residio_Stage. Correct 8-4-4-4-12 shape, but the version nibble is `6`
// and the variant nibble is `3`, so Zod 4's `.uuid()` rejects it.
const STORED_ID = 'c1925ee4-f234-6570-38c3-347b9299e399';
// A canonical v4 id, for the cases that must keep working.
const V4_ID = '77777777-7777-4777-8777-777777777777';

const baseResident = {
  first_name: 'Doris',
  last_name: 'Adewole',
  phone_primary: '08064123131',
  resident_type: 'secondary' as const,
};

describe('#1134 stored identifiers pass validation', () => {
  it('rejects the stored id under the old .uuid() rule, which is the bug being fixed', () => {
    expect(z.uuid().safeParse(STORED_ID).success).toBe(false);
    expect(z.guid().safeParse(STORED_ID).success).toBe(true);
  });

  it('accepts a stored house id on the resident create form', () => {
    const result = createResidentBaseSchema.safeParse({ ...baseResident, house_id: STORED_ID });
    expect(result.success).toBe(true);
  });

  it('accepts a stored house id through the refined create schema', () => {
    const result = createResidentSchema.safeParse({ ...baseResident, house_id: STORED_ID });
    expect(result.success).toBe(true);
  });

  it('accepts stored ids on the house assignment schema', () => {
    const result = houseAssignmentSchema.safeParse({
      house_id: STORED_ID,
      resident_role: 'co_resident',
      sponsor_resident_id: STORED_ID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a stored street id on the house form', () => {
    const result = houseFormSchema.safeParse({
      house_number: '18A',
      street_id: STORED_ID,
      house_type_id: STORED_ID,
      billing_profile_id: STORED_ID,
      number_of_plots: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts stored ids on the security contact form', () => {
    const result = createSecurityContactSchema.safeParse({
      resident_id: STORED_ID,
      category_id: STORED_ID,
      full_name: 'Doris Adewole',
      phone_primary: '08064123131',
      is_recurring: false,
    });
    expect(result.success).toBe(true);
  });

  it('still rejects a value that is not an identifier at all', () => {
    for (const bad of ['', 'not-a-uuid', '123', `${STORED_ID}-extra`]) {
      const result = createResidentBaseSchema.safeParse({ ...baseResident, house_id: bad });
      expect(result.success, `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }
  });

  it('keeps the field optional and keeps its custom message', () => {
    expect(createResidentBaseSchema.safeParse(baseResident).success).toBe(true);

    const result = createResidentBaseSchema.safeParse({ ...baseResident, house_id: 'nope' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'house_id');
      expect(issue?.message).toBe('Please select a house');
    }
  });
});

describe('#1134 no stored-identifier schema is left on .uuid()', () => {
  const settleWallet = readFileSync(
    join(process.cwd(), 'src/actions/billing/settle-wallet-invoices.ts'),
    'utf8',
  );

  it('keeps .uuid() only for requestKey, which the client mints with crypto.randomUUID()', () => {
    const uuidLines = settleWallet
      .split('\n')
      .filter((line) => line.includes('.uuid('))
      .map((line) => line.trim());

    expect(uuidLines).toHaveLength(1);
    expect(uuidLines[0]).toContain('requestKey');
    // The strict rule still applies there: a minted v4 passes, a stored id does not.
    expect(z.uuid().safeParse(V4_ID).success).toBe(true);
    expect(z.uuid().safeParse(STORED_ID).success).toBe(false);
  });
});
