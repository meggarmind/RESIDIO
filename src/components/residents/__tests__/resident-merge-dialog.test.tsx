// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ResidentMergePreview } from '@/actions/residents/merge-residents';

const CURRENT = { id: 'res-kept', first_name: 'Ada', last_name: 'Obi', resident_code: '123456' };
const OTHER = { id: 'res-dup', first_name: 'Ada', last_name: 'Obi', resident_code: '654321' };

const mocks = vi.hoisted(() => ({
  preview: null as ResidentMergePreview | null,
  previewArgs: vi.fn(),
  mutateAsync: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/use-residents', () => ({
  useResidentOptions: () => ({ data: { data: [CURRENT, OTHER] } }),
  useResidentMergePreview: (keptId?: string, duplicateId?: string) => {
    mocks.previewArgs(keptId, duplicateId);
    return { data: keptId && duplicateId ? mocks.preview : undefined, isLoading: false, error: null };
  },
  useMergeResidents: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
// A plain select stands in for the popover combobox, which needs layout APIs jsdom lacks.
vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ options, value, onValueChange }: { options: Array<{ value: string; label: string }>; value: string; onValueChange: (v: string) => void }) => (
    <select aria-label="Other record" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">Choose</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

import { ResidentMergeDialog } from '@/components/residents/resident-merge-dialog';

const contact = (phone: string) => ({
  email: null,
  email_verified_at: null,
  phone_primary: phone,
  phone_verified_at: null,
  phone_secondary: null,
});

function previewFor(overrides: Partial<ResidentMergePreview> = {}): ResidentMergePreview {
  return {
    kept_resident_id: CURRENT.id,
    duplicate_resident_id: OTHER.id,
    can_merge: true,
    blockers: [],
    warnings: { possible_duplicate_payments: [], overlapping_invoices: [] },
    kept: { id: CURRENT.id, resident_code: '123456', name: 'Ada Obi', entity_type: 'individual', account_status: 'active', has_login: true, has_whatsapp_pin: false },
    duplicate: { id: OTHER.id, resident_code: '654321', name: 'Ada Obi', entity_type: 'individual', account_status: 'active', has_login: false, has_whatsapp_pin: false },
    contact: { kept: contact('08000000001'), duplicate: contact('08000000002'), suggest_duplicate_phone_as_secondary: true },
    counts: { 'payment_records.resident_id': 3, 'invoices.resident_id': 0 },
    folds: {},
    replaced_kept_rows: { resident_houses: 0 },
    wallets: { kept_balance: 0, duplicate_balance: 250, combined_balance: 250, duplicate_has_wallet: true },
    account_balances: { kept_closing_balance: 0, duplicate_closing_balance: 0, combined_closing_balance: 0 },
    ...overrides,
  };
}

function renderDialog(onMerged = vi.fn()) {
  render(<ResidentMergeDialog open onOpenChange={vi.fn()} resident={CURRENT} onMerged={onMerged} />);
  fireEvent.change(screen.getByLabelText('Other record'), { target: { value: OTHER.id } });
  return onMerged;
}

const mergeButton = () => screen.getByRole('button', { name: 'Merge residents' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview = previewFor();
});
afterEach(cleanup);

describe('ResidentMergeDialog', () => {
  it('shows each blocker as a sentence and keeps the merge disabled', () => {
    mocks.preview = previewFor({
      can_merge: false,
      blockers: [{ code: 'both_logins', message: 'Both records have a portal login. Unlink one first.', detail: null }],
    });
    renderDialog();

    expect(screen.getByText('This merge cannot go ahead')).toBeInTheDocument();
    expect(screen.getByText('Both records have a portal login. Unlink one first.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/to confirm/)).not.toBeInTheDocument();
    expect(mergeButton()).toBeDisabled();
  });

  it('lists what moves and keeps the merge disabled until the kept code is typed', () => {
    renderDialog();

    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.queryByText('Invoices')).not.toBeInTheDocument();
    expect(mergeButton()).toBeDisabled();

    const confirm = screen.getByLabelText(/to confirm/);
    fireEvent.change(confirm, { target: { value: '654321' } });
    expect(mergeButton()).toBeDisabled();

    fireEvent.change(confirm, { target: { value: '123456' } });
    expect(mergeButton()).toBeEnabled();
  });

  it('swaps which record is kept when the admin picks the other one', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Keep 654321' }));

    expect(mocks.previewArgs).toHaveBeenLastCalledWith(OTHER.id, CURRENT.id);
  });

  it('merges with the chosen contact fields and reports success', async () => {
    mocks.mutateAsync.mockResolvedValue({ kept_resident_id: CURRENT.id, whatsapp_pin_cleared: false, kept_has_whatsapp_pin: false });
    const onMerged = renderDialog();

    fireEvent.click(screen.getByRole('radio', { name: /08000000002 \(duplicate's primary phone\)/ }));
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: '123456' } });
    fireEvent.click(mergeButton());

    await waitFor(() => expect(onMerged).toHaveBeenCalled());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      keptId: CURRENT.id,
      duplicateId: OTHER.id,
      contactChoices: { phone_secondary: 'duplicate_phone_primary' },
      confirmationCode: '123456',
    });
    expect(mocks.toast.success).toHaveBeenCalledWith('Merged 654321 into 123456');
  });
});
