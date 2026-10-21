// @vitest-environment jsdom
// Issue #788: settings write controls render only for a user holding the
// permission the matching server action enforces (CORE.md section 6).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';

const { mocks, mutation, query } = vi.hoisted(() => ({
  mocks: { permissions: [] as string[] },
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  query: (data: unknown) => () => ({ data, isLoading: false, refetch: vi.fn() }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => mocks.permissions.includes(p)),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/settings/roles',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/use-reference', () => ({
  useStreets: query([{ id: 's1', name: 'Oak Avenue', short_name: 'Oak', description: null, is_active: true }]),
  useCreateStreet: mutation,
  useUpdateStreet: mutation,
  useDuplicateStreet: mutation,
  useDeleteStreet: mutation,
  useHouseTypes: query([{ id: 'h1', name: 'Duplex', description: null, max_residents: 5, billing_profile_id: null, billing_profile: null }]),
  useCreateHouseType: mutation,
  useUpdateHouseType: mutation,
  useTransactionTags: query([{ id: 't1', name: 'Dues', transaction_type: 'credit', keywords: [], description: null, color: 'gray', sort_order: 1, is_active: true }]),
  useCreateTransactionTag: mutation,
  useUpdateTransactionTag: mutation,
  useDeleteTransactionTag: mutation,
  useDeleteTransactionTags: mutation,
}));
vi.mock('@/hooks/use-imports', () => ({
  useBankAccounts: query({ data: [{ id: 'b1', account_name: 'Estate Main', account_number: '0123456789', bank_name: 'FirstBank', description: null, is_active: true }] }),
  useCreateBankAccount: mutation,
  useUpdateBankAccount: mutation,
  useDeleteBankAccount: mutation,
}));
vi.mock('@/hooks/use-approvals', () => ({ useCanAutoApprove: query(true) }));
vi.mock('@/hooks/use-finance-permissions', () => ({ useCanViewInactiveBankAccounts: query({ authorized: true }) }));
vi.mock('@/hooks/use-roles', () => ({
  useRolesWithPermissions: query([
    { id: 'r1', name: 'treasurer', display_name: 'Treasurer', category: 'exco', is_active: true, is_system_role: false, permissions: [], user_count: 2 },
  ]),
  usePermissions: query([]),
  useAdminTitles: query([]),
  useCreateRoleWithPermissions: mutation,
  useUpdateRole: mutation,
  useDeleteRole: mutation,
}));
vi.mock('@/components/admin/role-permissions-dialog', () => ({ RolePermissionsDialog: () => null }));
vi.mock('@/components/admin/permission-picker', () => ({ PermissionPicker: () => null }));
vi.mock('@/components/admin/role-assignment-rules', () => ({ RoleAssignmentRulesEditor: () => null }));
vi.mock('@/hooks/use-security', () => ({
  useSecuritySettings: query({ auto_expire_contacts: true, max_contacts_per_resident: 50, expiry_warning_days: [7] }),
  useUpdateSecuritySetting: mutation,
  useResetSecuritySettings: mutation,
  useSecurityContactCategories: query([{ id: 'c1', name: 'Visitor', default_validity_days: 30, max_validity_days: 90, is_active: true }]),
  useUpdateSecurityContactCategory: mutation,
  useToggleCategoryActive: mutation,
}));
vi.mock('@/hooks/use-settings', () => ({
  useBillingSettings: query([{ key: 'late_fee_enabled', value: true }, { key: 'clearance_copy_recipient_group_id', value: 'g1' }]),
  useClearanceCopyOptions: query([{ id: 'g1', name: 'Estate officials', description: null, usedBy: ['Clearance certificate copies'], members: [{ residentId: 'm1', name: 'A. Bello', inactive: false, warning: 'not opted in' }, { residentId: 'm2', name: 'B. Okafor', inactive: false, warning: null }] }]),
  useUpdateSetting: mutation,
  useGeneralSettings: query([{ key: 'estate_logo_url', value: 'https://example.test/logo.png' }]),
  useUploadEstateLogo: mutation,
  useRemoveEstateLogo: mutation,
  useSystemSettings: query([]),
  useUpdateSettings: mutation,
}));
vi.mock('@/hooks/use-billing', () => ({
  useBillingProfiles: query([]),
  useApplyLateFees: mutation,
  useLateFeeWaivers: query({
    data: [{ id: 'w1', invoice: { invoice_number: 'INV-1' }, resident: { first_name: 'Ada', last_name: 'Okoro' }, original_late_fee: 500, waiver_type: 'full', waiver_amount: null, reason: 'Bank delay', created_at: '2026-10-01T00:00:00Z' }],
    total: 1,
  }),
  usePendingWaiverCount: query(1),
  useApproveLateFeeWaiver: mutation,
  useRejectLateFeeWaiver: mutation,
}));
vi.mock('@/actions/billing/apply-late-fees', () => ({ previewLateFees: vi.fn() }));
vi.mock('@/actions/system/prune-data', () => ({ pruneSystemData: vi.fn(), previewPruneSystemData: vi.fn() }));
vi.mock('next/image', () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { StreetsList } from '@/components/admin/streets-list';
import { HouseTypesList } from '@/components/admin/house-types-list';
import { TransactionTagsList } from '@/components/admin/transaction-tags-list';
import { BankAccountsList } from '@/components/admin/bank-accounts-list';
import { RolesList } from '@/components/admin/roles-list';
import { SecurityLimitsSection as SecuritySettingsPage } from '@/components/settings/security/security-limits-section';
import { ContactCategoriesSection as CategoriesPage } from '@/components/settings/security/contact-categories-section';
import { BillingGeneralSection as BillingSettingsPage } from '@/components/settings/billing/billing-general-section';
import { LateFeesSection as LateFeesPage } from '@/components/settings/billing/late-fees-section';
import { EstateLogoSection } from '@/components/settings/estate/estate-logo-section';
import { RetentionSection } from '@/components/settings/system/retention-section';
import { Switch } from '@/components/ui/switch';

/** Opens the section a page starts collapsed, as an admin would. */
function Opened({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
  }, []);
  return <div ref={ref}>{children}</div>;
}

type Case = {
  name: string;
  ui: () => ReactElement;
  /** The permission the matching server action enforces. */
  permission: string;
  /** Buttons that must be absent without the permission and present with it. */
  buttons: RegExp[];
  /** Inputs that must be disabled without the permission and enabled with it. */
  fields?: [role: 'switch' | 'checkbox' | 'spinbutton' | 'textbox' | 'combobox', name: RegExp][];
};

const CASES: Case[] = [
  {
    name: 'streets list',
    ui: () => <StreetsList />,
    permission: PERMISSIONS.SETTINGS_MANAGE_REFERENCE,
    buttons: [/^Add Street$/, /Edit street Oak Avenue/, /Duplicate street Oak Avenue/, /Delete street Oak Avenue/],
  },
  {
    name: 'house types list',
    ui: () => <HouseTypesList />,
    permission: PERMISSIONS.SETTINGS_MANAGE_REFERENCE,
    buttons: [/^Add Type$/, /Edit Duplex/],
  },
  {
    name: 'transaction tags list',
    ui: () => <TransactionTagsList />,
    permission: PERMISSIONS.SETTINGS_MANAGE_REFERENCE,
    buttons: [/^Add Tag$/, /Edit tag Dues/, /Delete tag Dues/],
  },
  {
    name: 'bank accounts list',
    ui: () => <BankAccountsList />,
    permission: PERMISSIONS.SETTINGS_MANAGE_REFERENCE,
    buttons: [/^Add Account$/, /Edit Estate Main/, /Delete Estate Main/],
  },
  {
    name: 'roles list',
    ui: () => <RolesList />,
    permission: PERMISSIONS.SYSTEM_MANAGE_ROLES,
    buttons: [/^Add Role$/, /Edit role Treasurer/, /Delete role Treasurer/],
  },
  {
    name: 'security settings',
    ui: () => <SecuritySettingsPage />,
    permission: PERMISSIONS.SETTINGS_MANAGE_SECURITY,
    buttons: [/Reset to Defaults/],
    fields: [['switch', /Auto-Expire Contacts/]],
  },
  {
    name: 'security categories',
    ui: () => <CategoriesPage />,
    permission: PERMISSIONS.SECURITY_MANAGE_CATEGORIES,
    buttons: [/^Edit Visitor$/],
  },
  {
    name: 'billing settings',
    ui: () => <BillingSettingsPage />,
    permission: PERMISSIONS.SETTINGS_MANAGE_BILLING,
    buttons: [],
    fields: [['switch', /Bill vacant houses/], ['checkbox', /7 days before/], ['combobox', /Send copies to/]],
  },
  {
    name: 'billing settings: profiles permission (#840)',
    ui: () => <BillingSettingsPage />,
    permission: PERMISSIONS.BILLING_MANAGE_PROFILES,
    buttons: [],
    fields: [['switch', /Bill vacant houses/]],
  },
  {
    name: 'late fees: settings',
    ui: () => <LateFeesPage />,
    permission: PERMISSIONS.SETTINGS_MANAGE_BILLING,
    buttons: [],
    fields: [['switch', /Enable late fees/]],
  },
  {
    name: 'late fees: apply',
    ui: () => <LateFeesPage />,
    permission: PERMISSIONS.BILLING_APPLY_LATE_FEES,
    buttons: [/Apply Late Fees Now/],
  },
  {
    name: 'late fees: waiver review',
    ui: () => <LateFeesPage />,
    permission: PERMISSIONS.BILLING_APPROVE_LATE_FEE_WAIVER,
    buttons: [/^Review$/],
  },
  {
    name: 'branding',
    ui: () => <EstateLogoSection />,
    permission: PERMISSIONS.SETTINGS_MANAGE_GENERAL,
    buttons: [/Replace Logo/, /^Remove$/],
  },
  {
    name: 'data retention: prune',
    ui: () => <Opened><RetentionSection /></Opened>,
    permission: PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION,
    buttons: [/Prune Data/],
  },
  {
    name: 'data retention: retention days',
    ui: () => <Opened><RetentionSection /></Opened>,
    permission: PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION,
    buttons: [/^Save Data retention$/],
  },
];

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.SETTINGS_VIEW];
});
afterEach(() => cleanup());

describe.each(CASES)('$name (#788)', ({ ui, permission, buttons, fields = [] }) => {
  it('hides write buttons and disables fields without the permission', () => {
    render(ui());
    for (const name of buttons) {
      expect(screen.queryAllByRole('button', { name }), String(name)).toHaveLength(0);
    }
    // A section the admin may not use renders nothing (#937); any control that does render must be disabled.
    for (const [role, name] of fields) {
      for (const el of screen.queryAllByRole(role, { name })) expect(el).toBeDisabled();
    }
  });

  it('shows them with the permission', () => {
    mocks.permissions.push(permission);
    render(ui());
    for (const name of buttons) {
      expect(screen.getAllByRole('button', { name }).length, String(name)).toBeGreaterThan(0);
    }
    for (const [role, name] of fields) {
      for (const el of screen.getAllByRole(role, { name })) expect(el).toBeEnabled();
    }
  });
});

// The assign-only admin's view of the Roles tab moved to roles-access-912.test.tsx (#912).

describe('role delete dialog (#788)', () => {
  it('says how many users hold the role and blocks the delete', async () => {
    mocks.permissions = [PERMISSIONS.SYSTEM_MANAGE_ROLES];
    render(<RolesList />);
    screen.getAllByRole('button', { name: /Delete role Treasurer/ })[0].click();
    expect(await screen.findByText(/2 users hold "Treasurer"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

const RAW_COLOUR = /\b(bg|text|border)-(green|red|amber|blue|gray|emerald|yellow|orange|purple)-\d{2,3}\b/;

describe('phone targets and colour tokens (#788)', () => {
  // The tags list is left out of the colour rule: its palette is the tag colour a user picks.
  const LISTS = CASES.filter((c) => c.name.endsWith(' list'));

  it.each(LISTS)('$name: icon-only buttons keep a 44px phone size', ({ ui, permission }) => {
    mocks.permissions.push(permission);
    render(ui());
    const iconButtons = screen.getAllByRole('button').filter((b) => !b.textContent?.trim());
    expect(iconButtons.length).toBeGreaterThan(0);
    for (const b of iconButtons) expect(b.className, b.getAttribute('aria-label') ?? '').toMatch(/(^|\s)(max-md:)?size-11(\s|$)/);
  });

  it.each(CASES.filter((c) => c.name !== 'transaction tags list'))(
    '$name: renders no raw palette colour',
    ({ ui, permission }) => {
      mocks.permissions.push(permission);
      const { container } = render(ui());
      const raw = [...container.querySelectorAll('[class]')]
        .map((el) => el.getAttribute('class') ?? '')
        .filter((c) => RAW_COLOUR.test(c));
      expect(raw).toEqual([]);
    }
  );

  it('the shared switch pads its hit area to 44px below md', () => {
    render(<Switch aria-label="Toggle" />);
    const cls = screen.getByRole('switch', { name: 'Toggle' }).className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['after:-inset-3', 'md:after:inset-0']));
  });
});
