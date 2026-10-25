// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { rows, mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ data: { id: 'imp-1' } }), isPending: false }),
  rows: [
  {
    id: 'r1', row_number: 1, status: 'matched', transaction_type: 'credit', amount: 25000,
    transaction_date: '2026-10-01', description: 'NIP from Ada Obi', reference: null, tag_id: null,
    duplicate_reason: null, match_confidence: 'high', matched_resident_id: 'res-1',
    resident: { first_name: 'Ada', last_name: 'Obi' },
  },
  {
    id: 'r2', row_number: 2, status: 'unmatched', transaction_type: 'debit', amount: 4500,
    transaction_date: '2026-10-02', description: 'POS purchase', reference: null, tag_id: null,
    duplicate_reason: null, match_confidence: null,
  },
],
}));

vi.mock('@/hooks/use-imports', () => ({
  useCreateImport: mutation,
  useCreateImportRows: mutation,
  useMatchImportRows: mutation,
  useUnmatchRow: mutation,
  useSkipRow: mutation,
  useImportRows: () => ({ data: { data: rows, count: 2 }, refetch: vi.fn(), isLoading: false, isFetching: false, error: null }),
  useImportRowSummary: () => ({ data: { total: 2, matched: 1, unmatched: 1, pending: 0, skipped: 0 }, refetch: vi.fn(), isLoading: false, isFetching: false }),
  useImportBreakdown: () => ({ data: undefined }),
}));
vi.mock('@/hooks/use-reference', () => ({ useTransactionTags: () => ({ data: [] }) }));
vi.mock('@/actions/reference/transaction-tags', () => ({ tagImportRow: vi.fn() }));
vi.mock('@/lib/utils/hashing-client', () => ({ generateFileHashClient: vi.fn() }));
vi.mock('@/components/imports/manual-match-dialog', () => ({ ManualMatchDialog: () => null }));
vi.mock('@/components/imports/row-details-dialog', () => ({ RowDetailsDialog: () => null }));
vi.mock('@/components/imports/import-breakdown', () => ({ ImportBreakdown: () => null }));

import { ImportPreview } from '@/components/imports/import-preview';

afterEach(() => cleanup());

describe('ImportPreview phone layout (issue #1154)', () => {
  it('renders one card per row, with amount and actions, beside the md+ table', async () => {
    const { container } = render(
      <ImportPreview
        parsedRows={[]}
        columnMapping={{ date: 'd', description: 'x', withdrawal: 'w', deposit: 'c', reference: null }}
        bankAccountId="acc"
        fileName="s.csv"
        fileType="csv"
        file={null}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const list = await screen.findByTestId('import-row-cards');
    expect(list).toHaveClass('md:hidden');
    const cards = within(list).getAllByTestId('import-row-card');
    expect(cards).toHaveLength(rows.length);

    expect(within(cards[0]).getByText('₦25,000')).toHaveClass('whitespace-nowrap', 'tabular-nums');
    expect(within(cards[0]).getByText('Ada Obi')).toBeInTheDocument();
    expect(within(cards[0]).getByRole('button', { name: 'Clear match' })).toHaveClass('h-11', 'w-11');
    expect(within(cards[0]).getByRole('button', { name: 'Skip this transaction' })).toBeInTheDocument();

    expect(within(cards[1]).getByText('Unmatched', { selector: 'p' })).toBeInTheDocument();
    expect(within(cards[1]).getByRole('button', { name: 'Manually assign resident' })).toHaveClass('h-11', 'w-11');

    // the table stays in the DOM, shown from md up
    expect(container.querySelector('table')?.closest('.hidden.md\\:block')).not.toBeNull();
  });
});
