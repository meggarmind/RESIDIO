// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

// #790 page wiring: numeric settings write once on blur (never per keystroke, never a
// fallback), and every charging, deleting, locking-out or sending action runs only after a
// confirmation that shows its dry-run preview.

const m = vi.hoisted(() => ({
  settings: [] as { key: string; value: unknown }[],
  updateSetting: vi.fn(),
  updateSettings: vi.fn(),
  applyLateFees: vi.fn(),
  generateLevies: vi.fn(),
  sendReminders: vi.fn(),
  updateSecuritySetting: vi.fn(),
  previewLateFees: vi.fn(),
  previewRetroactiveLevies: vi.fn(),
  previewPruneSystemData: vi.fn(),
  pruneSystemData: vi.fn(),
  previewPaymentReminders: vi.fn(),
  previewMaintenanceLockout: vi.fn(),
  updateMaintenanceMode: vi.fn(),
}));

const mutation = (mutate: ReturnType<typeof vi.fn>) => ({ mutate, mutateAsync: mutate, isPending: false });
const query = (data: unknown) => ({ data, isLoading: false });

// Every control renders: these tests are about behaviour, not permission gating (#788).
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ isLoading: false, hasPermission: () => true }) }));
vi.mock('@/hooks/use-settings', () => ({
  useBillingSettings: () => query(m.settings),
  useSystemSettings: () => query(m.settings),
  useSettings: () => query(m.settings),
  useUpdateSetting: () => mutation(m.updateSetting),
  useUpdateSettings: () => mutation(m.updateSettings),
  useCurrentDevelopmentLevyProfileId: () => query(null),
  useSetCurrentDevelopmentLevyProfileId: () => mutation(vi.fn()),
  useGenerateRetroactiveLevies: () => mutation(m.generateLevies),
}));
vi.mock('@/hooks/use-billing', () => ({
  useApplyLateFees: () => mutation(m.applyLateFees),
  useLateFeeWaivers: () => query({ data: [] }),
  usePendingWaiverCount: () => query(0),
  useApproveLateFeeWaiver: () => mutation(vi.fn()),
  useRejectLateFeeWaiver: () => mutation(vi.fn()),
  useDevelopmentLevyProfiles: () => query([]),
}));
vi.mock('@/hooks/use-security', () => ({
  useSecuritySettings: () => query({ auto_expire_contacts: true, max_contacts_per_resident: 50, expiry_warning_days: [7] }),
  useUpdateSecuritySetting: () => mutation(m.updateSecuritySetting),
  useResetSecuritySettings: () => mutation(vi.fn()),
}));
vi.mock('@/hooks/use-email', () => ({
  useSendPaymentReminders: () => mutation(m.sendReminders),
  useTestEmail: () => mutation(vi.fn()),
}));
vi.mock('@/actions/billing/apply-late-fees', () => ({ previewLateFees: m.previewLateFees }));
vi.mock('@/actions/billing/generate-levies', () => ({ previewRetroactiveLevies: m.previewRetroactiveLevies }));
vi.mock('@/actions/system/prune-data', () => ({ previewPruneSystemData: m.previewPruneSystemData, pruneSystemData: m.pruneSystemData }));
vi.mock('@/actions/email/send-payment-reminders', () => ({ previewPaymentReminders: m.previewPaymentReminders }));
vi.mock('@/actions/settings/update-maintenance-mode', () => ({
  previewMaintenanceLockout: m.previewMaintenanceLockout,
  updateMaintenanceMode: m.updateMaintenanceMode,
}));

import BillingSettingsPage from '@/app/(dashboard)/settings/billing/page';
import LateFeesPage from '@/app/(dashboard)/settings/billing/late-fees/page';
import DevelopmentLeviesPage from '@/app/(dashboard)/settings/billing/development-levies/page';
import SecuritySettingsPage from '@/app/(dashboard)/settings/security/page';
import DataRetentionPage from '@/app/(dashboard)/settings/data-retention/page';
import EmailDebugPage from '@/app/(dashboard)/settings/email/debug/page';
import MaintenancePage from '@/app/(dashboard)/settings/maintenance/page';

function renderPage(Page: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}

function typeSlowly(input: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i++) fireEvent.change(input, { target: { value: text.slice(0, i) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.settings = [
    { key: 'late_fee_enabled', value: true },
    { key: 'late_fee_type', value: 'percentage' },
    { key: 'late_fee_amount', value: 5 },
    { key: 'grace_period_days', value: 7 },
    { key: 'invoice_due_window_days', value: 30 },
    { key: 'maintenance_mode', value: false },
    { key: 'maintenance_message', value: 'Back soon' },
    { key: 'session_timeout_minutes', value: 60 },
    { key: 'duplicate_matching_threshold', value: 90 },
    { key: 'audit_log_retention_days', value: 365 },
  ];
});
afterEach(() => cleanup());

describe('numeric settings save on blur only', () => {
  it('late fees: typing a grace period writes once on blur; clearing or 0 writes nothing', () => {
    renderPage(LateFeesPage);
    const grace = screen.getByLabelText('Grace Period (days)');
    typeSlowly(grace, '20');
    expect(m.updateSetting).not.toHaveBeenCalled();
    fireEvent.blur(grace);
    expect(m.updateSetting).toHaveBeenCalledTimes(1);
    expect(m.updateSetting).toHaveBeenCalledWith({ key: 'grace_period_days', value: '20' });

    m.updateSetting.mockClear();
    for (const value of ['', '0', '31']) {
      fireEvent.change(grace, { target: { value } });
      fireEvent.blur(grace);
    }
    expect(m.updateSetting).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a whole number from 1 to 30.')).toBeInTheDocument();
  });

  it('late fees: clearing the amount writes nothing instead of 0', () => {
    renderPage(LateFeesPage);
    const amount = screen.getByLabelText('Late Fee Amount (%)');
    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.blur(amount);
    expect(m.updateSetting).not.toHaveBeenCalled();
  });

  it('billing: the due window writes once on blur and never a fallback', () => {
    renderPage(BillingSettingsPage);
    const window = screen.getByLabelText('Invoice Due Window');
    typeSlowly(window, '45');
    fireEvent.blur(window);
    expect(m.updateSetting).toHaveBeenCalledTimes(1);
    expect(m.updateSetting).toHaveBeenCalledWith({ key: 'invoice_due_window_days', value: '45' });
    m.updateSetting.mockClear();
    fireEvent.change(window, { target: { value: '' } });
    fireEvent.blur(window);
    expect(m.updateSetting).not.toHaveBeenCalled();
  });

  it('security: typing "20" writes 20 once, not 2 then 20', () => {
    renderPage(SecuritySettingsPage);
    const max = screen.getByLabelText('Max Contacts Per Category');
    typeSlowly(max, '20');
    expect(max).not.toBeDisabled();
    fireEvent.blur(max);
    expect(m.updateSecuritySetting).toHaveBeenCalledTimes(1);
    expect(m.updateSecuritySetting).toHaveBeenCalledWith({ key: 'security_max_contacts_per_resident', value: 20 });
  });

  it('maintenance: fields are drafts until Save, and an invalid one blocks Save', async () => {
    renderPage(MaintenancePage);
    const timeout = screen.getByLabelText('Session Timeout (minutes)');
    fireEvent.change(timeout, { target: { value: '2' } });
    fireEvent.blur(timeout);
    expect(await screen.findByRole('button', { name: /Save changes/ })).toBeDisabled();
    fireEvent.change(timeout, { target: { value: '30' } });
    fireEvent.blur(timeout);
    expect(m.updateSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(m.updateSettings).toHaveBeenCalledWith({ session_timeout_minutes: 30 }, expect.anything());
  });
});

describe('guarded actions confirm with a preview', () => {
  it('Apply Late Fees Now previews the count and total and applies only on confirm', async () => {
    m.previewLateFees.mockResolvedValue({
      data: { enabled: true, gracePeriodDays: 7, lateFeeType: 'percentage', lateFeeRate: 5, eligible: 12, totalLateFees: 45000, skippedWaiver: 1, skippedAlreadyApplied: 3 },
      error: null,
    });
    renderPage(LateFeesPage);
    fireEvent.click(screen.getByRole('button', { name: /Apply Late Fees Now/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('45,000');
    expect(dialog).toHaveTextContent('cannot be undone');
    expect(dialog).toHaveTextContent('Running it again is safe');
    expect(m.applyLateFees).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(m.applyLateFees).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Apply Late Fees Now/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply late fees' }));
    await waitFor(() => expect(m.applyLateFees).toHaveBeenCalledTimes(1));
  });

  it('Generate Retroactive Levies previews houses, invoices and total before generating', async () => {
    m.previewRetroactiveLevies.mockResolvedValue({
      data: { autoGenerateEnabled: true, housesChecked: 179, houses: 4, invoices: 5, totalAmount: 2500000, alreadyCharged: 10 },
      error: null,
    });
    renderPage(DevelopmentLeviesPage);
    fireEvent.click(screen.getByRole('button', { name: /Generate Retroactive Levies/ }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog).toHaveTextContent('2,500,000'));
    expect(dialog).toHaveTextContent('5 levy invoice(s) for 4 house(s)');
    expect(m.generateLevies).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate levies' }));
    await waitFor(() => expect(m.generateLevies).toHaveBeenCalledTimes(1));
  });

  it('Prune Data shows dry-run counts and needs PRUNE typed', async () => {
    m.previewPruneSystemData.mockResolvedValue({
      data: { notifications: 40, auditLogs: 1234, searchLogs: 5, systemActionLogs: 6 },
      error: null,
    });
    m.pruneSystemData.mockResolvedValue({ data: { notifications: 40, auditLogs: 1234, searchLogs: 5, systemActionLogs: 6 }, error: null });
    renderPage(DataRetentionPage);
    fireEvent.click(screen.getByRole('button', { name: /Prune Data/ }));
    expect(await screen.findByText('1234')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Delete permanently' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type PRUNE to confirm'), { target: { value: 'PRUNE' } });
    expect(m.pruneSystemData).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(m.pruneSystemData).toHaveBeenCalledTimes(1));
  });

  it('Send Reminders names the recipient count before sending', async () => {
    m.previewPaymentReminders.mockResolvedValue({ data: { recipients: 9, invoices: 11, skipped: 2, disabledReason: null }, error: null });
    renderPage(EmailDebugPage);
    fireEvent.click(screen.getByRole('button', { name: /Send Reminders/ }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog).toHaveTextContent('11 reminder(s) to 9 resident(s)'));
    expect(m.sendReminders).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send reminders' }));
    await waitFor(() => expect(m.sendReminders).toHaveBeenCalledTimes(1));
  });

  it('maintenance mode shows who is locked out and switches on once, only after confirm', async () => {
    m.previewMaintenanceLockout.mockResolvedValue({
      data: { total: 7, byRole: [{ role: 'Chairman', count: 2 }, { role: 'No admin role (residents)', count: 5 }] },
      error: null,
    });
    m.updateMaintenanceMode.mockResolvedValue({ success: true });
    renderPage(MaintenancePage);
    fireEvent.click(screen.getByLabelText('Enable Maintenance Mode'));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog).toHaveTextContent('7 active account(s) will be locked out'));
    expect(dialog).toHaveTextContent('Chairman: 2');
    expect(dialog).toHaveTextContent('Back soon');
    expect(m.updateMaintenanceMode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on maintenance mode' }));
    await waitFor(() => expect(m.updateMaintenanceMode).toHaveBeenCalledWith(true));
    expect(m.updateMaintenanceMode).toHaveBeenCalledTimes(1);
    expect(m.updateSetting).not.toHaveBeenCalled();
  });
});
