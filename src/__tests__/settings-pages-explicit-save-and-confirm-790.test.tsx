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
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }) }));
vi.mock('@/hooks/use-settings', () => ({
  useBillingSettings: () => query(m.settings),
  useClearanceCopyOptions: () => query([]),
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

import { BillingGeneralSection as BillingSettingsPage } from '@/components/settings/billing/billing-general-section';
import { LateFeesSection as LateFeesPage } from '@/components/settings/billing/late-fees-section';
import { LeviesSection as DevelopmentLeviesPage } from '@/components/settings/billing/levies-section';
import { DuplicateMatchingSection } from '@/components/settings/banking/duplicate-matching-section';
import { SecurityLimitsSection as SecuritySettingsPage } from '@/components/settings/security/security-limits-section';
import { SessionTimeoutSection } from '@/components/settings/security/session-timeout-section';
import { RetentionSection } from '@/components/settings/system/retention-section';
import { SendRemindersNowSection as EmailDebugPage } from '@/components/settings/messages/send-reminders-test-section';
import { MaintenanceModeSection } from '@/components/settings/system/maintenance-mode-section';

function renderPage(Page: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}

/** Opens the section a page starts collapsed, as an admin would. */
function openSection(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
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
    const grace = screen.getByRole('textbox', { name: 'Grace period' });
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
    const amount = screen.getByRole('textbox', { name: 'Late fee amount' });
    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.blur(amount);
    expect(m.updateSetting).not.toHaveBeenCalled();
  });

  it('billing: the due window writes once on blur and never a fallback', () => {
    renderPage(BillingSettingsPage);
    const window = screen.getByRole('textbox', { name: 'Invoice due window' });
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
    const max = screen.getByRole('textbox', { name: 'Max Contacts Per Category' });
    typeSlowly(max, '20');
    expect(max).not.toBeDisabled();
    fireEvent.blur(max);
    expect(m.updateSecuritySetting).toHaveBeenCalledTimes(1);
    expect(m.updateSecuritySetting).toHaveBeenCalledWith({ key: 'security_max_contacts_per_resident', value: 20 });
  });

  it('retention: the days are a draft until Save, and an invalid entry blocks Save', async () => {
    renderPage(RetentionSection);
    openSection('Data retention');
    const days = screen.getByRole('textbox', { name: 'Audit log retention' });
    fireEvent.change(days, { target: { value: '2' } });
    fireEvent.blur(days);
    expect(await screen.findByRole('button', { name: 'Save Data retention' })).toBeDisabled();
    fireEvent.change(days, { target: { value: '30' } });
    fireEvent.blur(days);
    expect(m.updateSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Data retention' }));
    await waitFor(() => expect(m.updateSettings).toHaveBeenCalledWith({ audit_log_retention_days: 30 }));
  });

  it('maintenance: the message is a draft until Save', async () => {
    renderPage(MaintenanceModeSection);
    fireEvent.change(screen.getByRole('textbox', { name: 'Maintenance message' }), { target: { value: 'Back at noon' } });
    expect(m.updateSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Maintenance mode' }));
    await waitFor(() => expect(m.updateSettings).toHaveBeenCalledWith({ maintenance_message: 'Back at noon' }));
  });

  it('session timeout (moved from maintenance, #937): a draft until Save, and an invalid one blocks Save', async () => {
    renderPage(SessionTimeoutSection);
    const timeout = screen.getByRole('textbox', { name: 'Session Timeout (minutes)' });
    fireEvent.change(timeout, { target: { value: '2' } });
    fireEvent.blur(timeout);
    expect(await screen.findByRole('button', { name: /Save Session timeout/ })).toBeDisabled();
    fireEvent.change(timeout, { target: { value: '30' } });
    fireEvent.blur(timeout);
    expect(m.updateSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Save Session timeout/ }));
    await waitFor(() => expect(m.updateSettings).toHaveBeenCalledWith({ session_timeout_minutes: 30 }));
  });

  it('maintenance mode no longer shows the session timeout', () => {
    renderPage(MaintenanceModeSection);
    expect(screen.queryByLabelText('Session Timeout (minutes)')).toBeNull();
  });

  it('banking: the duplicate threshold is a draft until its section Save, and an invalid one blocks Save (#935)', async () => {
    renderPage(DuplicateMatchingSection);
    const threshold = screen.getByRole('textbox', { name: 'Confidence threshold' });
    expect(screen.getByRole('button', { name: 'Save Duplicate matching' })).toBeDisabled();

    fireEvent.change(threshold, { target: { value: '150' } });
    fireEvent.blur(threshold);
    expect(m.updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Duplicate matching' })).toBeDisabled();

    fireEvent.change(threshold, { target: { value: '85' } });
    fireEvent.blur(threshold);
    expect(m.updateSettings).not.toHaveBeenCalled();
    const save = screen.getByRole('button', { name: 'Save Duplicate matching' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(m.updateSettings).toHaveBeenCalledWith({ duplicate_matching_threshold: 85 }));
  });

  it('maintenance no longer carries the duplicate threshold (#935)', () => {
    renderPage(MaintenanceModeSection);
    expect(screen.queryByLabelText(/Confidence Threshold/i)).not.toBeInTheDocument();
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
    renderPage(RetentionSection);
    openSection('Data retention');
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
    // The section starts collapsed (#934).
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
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
    renderPage(MaintenanceModeSection);
    fireEvent.click(screen.getByRole('switch', { name: 'Maintenance mode' }));
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
