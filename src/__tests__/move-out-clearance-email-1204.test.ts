/**
 * Issue #1204 -- the move-out clearance email must carry a body. Both move-out actions pass a
 * ClearanceCertificateEmail element to sendEmail instead of an empty `react`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@react-email/components';
import { initiateOwnerMoveOut } from '@/actions/residents/move-out-owner';
import { initiateRenterMoveOut } from '@/actions/residents/move-out-renter';
import { ClearanceCertificateEmail } from '@/emails/clearance-certificate';
import { sendEmail } from '@/lib/email/send-email';

const ESTATE = { estateName: 'Palm Court', estateAddress: '1 Palm Road' };

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn(async () => ({ authorized: true })) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: vi.fn(async () => ({})),
  getEstateEmailSettings: vi.fn(async () => ESTATE),
}));
vi.mock('@/lib/comms-override/resident-flag', () => ({
  resolveResidentOverride: vi.fn(async () => ({ ok: true, residentOverride: null })),
}));
vi.mock('@/lib/clearance/issue-certificate', () => ({ issueClearanceCertificate: vi.fn(async () => ({})) }));
vi.mock('@/lib/settings/get-system-setting', () => ({ getSystemSetting: vi.fn(async () => 7) }));
vi.mock('@/actions/billing/get-invoices', () => ({
  getResidentIndebtedness: vi.fn(async () => ({ data: { totalUnpaid: 0, invoiceCount: 0, unpaidByCategory: {} }, error: null })),
}));
vi.mock('@/actions/billing/wallet', () => ({
  getResidentWallets: vi.fn(async () => ({ data: { total: 0, wallets: [] }, error: null })),
}));

let assignmentRole = 'resident_landlord';

function singleFor(table: string) {
  switch (table) {
    case 'residents':
      return { id: 'res-1', first_name: 'Ada', last_name: 'Obi', resident_code: 'R-1', email: 'ada@example.com', phone_primary: null, profile_id: null };
    case 'resident_houses':
      return { id: 'rh-1', resident_role: assignmentRole };
    case 'houses':
      return { id: 'house-1', house_number: '1', short_name: null, street: { name: 'Main' } };
    default:
      return null;
  }
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order']) chain[m] = () => chain;
      chain.single = async () => ({ data: singleFor(table), error: null });
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res, rej);
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => makeClient(),
  createAdminClient: () => makeClient(),
}));

describe.each([
  ['owner', 'resident_landlord', () => initiateOwnerMoveOut({ residentId: 'res-1', houseId: 'house-1' })],
  ['renter', 'tenant', () => initiateRenterMoveOut({ residentId: 'res-1', houseId: 'house-1', destination: 'leaving_estate' })],
])('%s move-out clearance email (#1204)', (_role, role, run) => {
  beforeEach(() => {
    assignmentRole = role;
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes a ClearanceCertificateEmail element with the certificate data and estate details', async () => {
    const res = await run();
    expect(res.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const { react } = vi.mocked(sendEmail).mock.calls[0][0] as { react: { type: unknown; props: Record<string, unknown> } };
    expect(react).toBeTruthy();
    expect(react.type).toBe(ClearanceCertificateEmail);
    expect(react.props).toMatchObject({
      residentName: 'Ada Obi',
      houseAddress: '1, Main',
      estateName: 'Palm Court',
      estateAddress: '1 Palm Road',
    });
    expect(String(react.props.certificateNumber)).toBeTruthy();
    expect(react.props.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('ClearanceCertificateEmail', () => {
  it('renders a non-empty body with the date as dd mmm yyyy', async () => {
    const html = await render(
      ClearanceCertificateEmail({
        residentName: 'Ada Obi',
        houseAddress: '1, Main',
        certificateNumber: 'CC-123',
        validUntil: '2026-10-31',
        estateName: 'Palm Court',
      }),
    );
    expect(html).toContain('Ada Obi');
    expect(html).toContain('CC-123');
    expect(html).toContain('1, Main');
    expect(html).toContain('31 Oct 2026');
    expect(html).toContain('is cleared');
  });
});
