/**
 * Issue #1189 -- move-out clearance nets wallets against unpaid invoices per charge category:
 * credit in one category must not clear a deficit in another.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkOwnerClearance } from '@/actions/residents/move-out-owner';
import { checkRenterClearance } from '@/actions/residents/move-out-renter';
import { getResidentIndebtedness } from '@/actions/billing/get-invoices';
import { getResidentWallets } from '@/actions/billing/wallet';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/clearance/issue-certificate', () => ({ issueClearanceCertificate: vi.fn() }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: vi.fn() }));
vi.mock('@/lib/settings/get-system-setting', () => ({ getSystemSetting: vi.fn() }));
vi.mock('@/actions/billing/get-invoices', () => ({ getResidentIndebtedness: vi.fn() }));
vi.mock('@/actions/billing/wallet', () => ({ getResidentWallets: vi.fn() }));

function setup(wallets: Record<string, number>, unpaid: Record<string, number>) {
  vi.mocked(getResidentWallets).mockResolvedValue({
    data: {
      total: Object.values(wallets).reduce((a, b) => a + b, 0),
      wallets: Object.entries(wallets).map(([charge_category, balance]) => ({ charge_category, name: charge_category, wallet_id: null, balance })),
    },
    error: null,
  });
  vi.mocked(getResidentIndebtedness).mockResolvedValue({
    data: { totalUnpaid: Object.values(unpaid).reduce((a, b) => a + b, 0), invoiceCount: 1, unpaidByCategory: unpaid },
    error: null,
  } as never);
}

describe.each([
  ['owner', checkOwnerClearance],
  ['renter', checkRenterClearance],
])('%s clearance by category (#1189)', (_role, check) => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks when Transformer credit meets Dues debt', async () => {
    setup({ transformer: 100000 }, { dues: 100000 });
    const { data } = await check('r1');
    expect(data?.canProceed).toBe(false);
    expect(data?.netBalance).toBe(-100000);
    expect(data?.message).toContain('outstanding balance of ₦100,000');
  });

  it('proceeds when every category is covered by its own wallet', async () => {
    setup({ dues: 150000, transformer: 20000 }, { dues: 100000 });
    const { data } = await check('r1');
    expect(data?.canProceed).toBe(true);
    expect(data?.netBalance).toBe(70000);
  });

  it('proceeds with no debt and no wallets', async () => {
    setup({}, {});
    const { data } = await check('r1');
    expect(data?.canProceed).toBe(true);
    expect(data?.netBalance).toBe(0);
  });
});
