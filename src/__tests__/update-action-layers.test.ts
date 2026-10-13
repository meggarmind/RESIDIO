/**
 * #474: each protection layer must hold on its own, so these tests defeat the
 * layer beneath (mocked core / mocked Zod schema) and assert the layer under test.
 */
import { describe, it, expect, vi } from 'vitest';

const core = vi.fn(async (..._args: unknown[]) => ({ success: true }));
vi.mock('@/lib/payments/create-payment', () => ({ createPaymentCore: (...a: unknown[]) => core(...a) }));

const updates: unknown[] = [];
const builder: Record<string, unknown> = {};
for (const m of ['eq', 'select']) builder[m] = vi.fn(() => builder);
builder.update = vi.fn((p: unknown) => { updates.push(p); return builder; });
builder.single = vi.fn(async () => ({ data: { id: 'x', full_name: 'Jo', category: null, resident: null }, error: null }));
const supabase = { from: vi.fn(() => builder), auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u' } } })) } };

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn(async () => supabase) }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn(async () => ({ authorized: true })) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/audit/helpers', () => ({ getChangedValues: vi.fn(() => ({ old: {}, new: {} })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// Zod layer defeated: parse passes everything through untouched.
vi.mock('@/lib/validators/security-contact', () => ({
  updateSecurityContactSchema: { safeParse: (d: unknown) => ({ success: true, data: d }) },
  vehicleTypeEnum: { optional: () => ({}) },
}));

describe('createPayment public wrapper (core mocked)', () => {
  it('hands the core a payload without is_verified / bank_row_id', async () => {
    const { createPayment } = await import('@/actions/payments/create-payment');
    await createPayment({
      resident_id: 'r', amount: 1, payment_date: new Date(), status: 'paid',
      is_verified: true, bank_row_id: 'b',
    } as never);
    const arg = core.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('is_verified');
    expect(arg).not.toHaveProperty('bank_row_id');
    expect(arg.resident_id).toBe('r');
    expect(core.mock.calls[0][1]).toBeUndefined(); // never trusted
  });
});

describe('updateSecurityContact allow-list (schema bypassed)', () => {
  it('writes only allow-listed columns even if the schema lets extras through', async () => {
    const { updateSecurityContact } = await import('@/actions/security/contacts');
    await updateSecurityContact({
      id: 'x', full_name: 'Jo', status: 'revoked', created_by: 'evil', visit_count: 9,
    } as never);
    expect(updates[0]).toEqual({ full_name: 'Jo' });
  });
});
