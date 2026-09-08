import { describe, expect, it } from 'vitest';
import { createSecurityContactSchema, updateSecurityContactSchema } from '@/lib/validators/security-contact';

const basePayload = {
  resident_id: '11111111-1111-4111-8111-111111111111',
  category_id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Ada Okafor',
  phone_primary: '08031234567',
  is_recurring: false,
};

describe('createSecurityContactSchema phone_primary validation', () => {
  it('accepts a valid local Nigerian phone number (0803...)', () => {
    const result = createSecurityContactSchema.safeParse({ ...basePayload, phone_primary: '08031234567' });

    expect(result.success).toBe(true);
  });

  it('accepts a valid international Nigerian phone number (+234803...)', () => {
    const result = createSecurityContactSchema.safeParse({ ...basePayload, phone_primary: '+2348031234567' });

    expect(result.success).toBe(true);
  });

  it('rejects a phone number that is not in Nigerian format', () => {
    const result = createSecurityContactSchema.safeParse({ ...basePayload, phone_primary: '1234567890' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const phoneIssue = result.error.issues.find((issue) => issue.path[0] === 'phone_primary');
      expect(phoneIssue).toBeDefined();
    }
  });
});

describe('updateSecurityContactSchema phone_primary validation', () => {
  const id = '33333333-3333-4333-8333-333333333333';

  it('accepts a valid local Nigerian phone number when phone_primary is present', () => {
    const result = updateSecurityContactSchema.safeParse({ id, phone_primary: '08031234567' });

    expect(result.success).toBe(true);
  });

  it('accepts a valid international Nigerian phone number when phone_primary is present', () => {
    const result = updateSecurityContactSchema.safeParse({ id, phone_primary: '+2348031234567' });

    expect(result.success).toBe(true);
  });

  it('rejects a non-Nigerian-format phone_primary even though the field is optional', () => {
    const result = updateSecurityContactSchema.safeParse({ id, phone_primary: 'abcdefghij' });

    expect(result.success).toBe(false);
  });

  it('still succeeds when phone_primary is omitted entirely', () => {
    const result = updateSecurityContactSchema.safeParse({ id });

    expect(result.success).toBe(true);
  });
});
