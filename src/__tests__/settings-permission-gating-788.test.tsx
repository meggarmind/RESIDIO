// @vitest-environment jsdom
// Issue #788: settings write controls render only for a user holding the
// permission the matching server action enforces (CORE.md section 6).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactElement } from 'react';

const { mocks, mutation, query } = vi.hoisted(() => ({
  mocks: { permissions: [] as string[] },
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  query: (data: unknown) => () => ({ data, isLoading: false, refetch: vi.fn() }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
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
    { id: 'r1', name: 'treasurer', display_name: 'Treasurer', category: 'exco', level: 3, is_active: true, is_system_role: false, permissions: [], user_count: 2 },
  ]),
  usePermissions: query([]),
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
  useBillingSettings: query([{ key: 'late_fee_enabled', value: true }]),
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
import RolesSettingsPage from '@/app/(dashboard)/settings/roles/page';
import SecuritySettingsPage from '@/app/(dashboard)/settings/security/page';
import CategoriesPage from '@/app/(dashboard)/settings/security/categories/page';
import BillingSettingsPage from '@/app/(dashboard)/settings/billing/page';
import LateFeesPage from '@/app/(dashboard)/settings/billing/late-fees/page';
import BrandingPage from '@/app/(dashboard)/settings/branding/page';
import DataRetentionPage from '@/app/(dashboard)/settings/data-retention/page';

type Case = {
  name: string;
  ui: () => ReactElement;
  /** The permission the matching server action enforces. */
  permission: string;
  /** Buttons that must be absent without the permission and present with it. */
  buttons: RegExp[];
  /** Inputs that must be disabled without the permission and enabled with it. */
  fields?: [role: 'switch' | 'checkbox' | 'spinbutton' | 'textbox', name: RegExp][];
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
    permission: PERMISSIONS.IMPORTS_CREATE,
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
    permission: PERMISSIONS.SETTINGS_MANAGE_GENERAL,
    buttons: [],
    fields: [['switch', /Bill Vacant Houses/], ['checkbox', /7 days before/]],
  },
  {
    name: 'late fees: settings',
    ui: () => <LateFeesPage />,
    permission: PERMISSIONS.SETTINGS_MANAGE_GENERAL,
    buttons: [],
    fields: [['switch', /Enable Late Fees/]],
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
    ui: () => <BrandingPage />,
    permission: PERMISSIONS.SETTINGS_MANAGE_GENERAL,
    buttons: [/Replace Logo/, /^Remove$/],
  },
  {
    name: 'data retention: prune',
    ui: () => <DataRetentionPage />,
    permission: PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION,
    buttons: [/Prune Data/],
  },
  {
    name: 'data retention: retention days',
    ui: () => <DataRetentionPage />,
    permission: PERMISSIONS.SETTINGS_MANAGE_GENERAL,
    buttons: [/^Save$/],
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
    for (const [role, name] of fields) {
      for (const el of screen.getAllByRole(role, { name })) expect(el).toBeDisabled();
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

describe('roles page for an assign-only admin (#788)', () => {
  it('points to Accounts instead of rendering role definitions it cannot load', () => {
    mocks.permissions = [PERMISSIONS.SYSTEM_ASSIGN_ROLES];
    render(<RolesSettingsPage />);
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/system/accounts');
    expect(screen.queryByRole('tab', { name: /Role Definitions/ })).not.toBeInTheDocument();
  });
});

describe('role delete dialog (#788)', () => {
  it('says how many users hold the role and blocks the delete', async () => {
    mocks.permissions = [PERMISSIONS.SYSTEM_MANAGE_ROLES];
    render(<RolesList />);
    screen.getAllByRole('button', { name: /Delete role Treasurer/ })[0].click();
    expect(await screen.findByText(/2 users hold "Treasurer"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
