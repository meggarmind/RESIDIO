// @vitest-environment jsdom
//
// #1362: the Generate reports step 1 is a list-and-preview picker. These tests drive the real picker.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportTypePicker } from '@/components/reports/report-type-picker';
import { reportTypePreviews } from '@/components/reports/report-type-previews';
import { reportTypes, type ReportType } from '@/lib/validators/reports';

const config = Object.fromEntries(
  reportTypes.map((t) => [t.value, { icon: FileText, iconBg: 'bg-muted' }])
) as unknown as Record<ReportType, { icon: React.ElementType; iconBg: string }>;

// Same split as report-request-wizard.tsx.
const REALTIME: ReportType[] = ['debtors_report', 'indebtedness_summary', 'development_levy', 'invoice_aging'];
const AGNOSTIC: ReportType[] = ['debtors_report', 'indebtedness_summary', 'development_levy', 'invoice_aging'];

function renderPicker(value: ReportType | '' = 'financial_overview', onChange = vi.fn()) {
  render(
    <ReportTypePicker value={value} onChange={onChange} config={config} realtimeTypes={REALTIME} accountAgnosticTypes={AGNOSTIC} />
  );
  return onChange;
}

const list = () => screen.getByTestId('report-type-list');

afterEach(cleanup);

describe('ReportTypePicker (#1362)', () => {
  it('has a group and an example layout for every report type', () => {
    for (const type of reportTypes) {
      expect(type.group).toBeTruthy();
      expect(reportTypePreviews[type.value]).toBeDefined();
    }
  });

  it('lists all 8 report types', () => {
    renderPicker();
    for (const type of reportTypes) {
      expect(within(list()).getByRole('button', { name: type.label })).toBeTruthy();
    }
    expect(reportTypes).toHaveLength(8);
  });

  it('filters by label and by description', () => {
    renderPicker();
    const search = screen.getByLabelText('Search report types');

    fireEvent.change(search, { target: { value: 'aging' } });
    // "Invoice Aging Report" by label; "Debtors Report" by its "aging buckets" description.
    expect(within(list()).getByRole('button', { name: 'Invoice Aging Report' })).toBeTruthy();
    expect(within(list()).getByRole('button', { name: 'Debtors Report' })).toBeTruthy();
    expect(within(list()).queryByRole('button', { name: 'Transaction Log' })).toBeNull();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText('No report matches your search.')).toBeTruthy();
  });

  it('collapses and expands a group', () => {
    renderPicker();
    const header = within(list()).getByRole('button', { name: /Debts/ });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(within(list()).getByRole('button', { name: 'Debtors Report' })).toBeTruthy();

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(within(list()).queryByRole('button', { name: 'Debtors Report' })).toBeNull();
    // Other groups stay open.
    expect(within(list()).getByRole('button', { name: 'Transaction Log' })).toBeTruthy();

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(within(list()).getByRole('button', { name: 'Debtors Report' })).toBeTruthy();
  });

  it('calls onChange with the value of the clicked type', () => {
    const onChange = renderPicker();
    fireEvent.click(within(list()).getByRole('button', { name: 'Development Levy Report' }));
    expect(onChange).toHaveBeenCalledWith('development_levy');
  });

  it('marks the selected type with aria-pressed', () => {
    renderPicker('transaction_log');
    expect(within(list()).getByRole('button', { name: 'Transaction Log' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(list()).getByRole('button', { name: 'Collection Report' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the date and account chips for a non-realtime type', () => {
    renderPicker('financial_overview');
    const aim = screen.getByTestId('report-type-aim');
    expect(within(aim).getByText('Asks for a date range')).toBeTruthy();
    expect(within(aim).getByText('Asks for bank accounts')).toBeTruthy();
    expect(within(aim).getByText('Next step: Time Period (step 2)')).toBeTruthy();
    expect(within(aim).queryByText('Always as of today')).toBeNull();
  });

  it('shows the date and account chips for a realtime type', () => {
    renderPicker('debtors_report');
    const aim = screen.getByTestId('report-type-aim');
    expect(within(aim).getByText('Always as of today')).toBeTruthy();
    expect(within(aim).getByText('No bank account step')).toBeTruthy();
    expect(within(aim).getByText('Next step: Options (step 4)')).toBeTruthy();
    expect(within(aim).queryByText('Asks for a date range')).toBeNull();
  });

  it('labels the preview as an example and uses month names in dates', () => {
    renderPicker('invoice_aging');
    const preview = screen.getByTestId('report-type-preview');
    expect(within(preview).getByText('Example layout')).toBeTruthy();
    expect(preview.textContent ?? '').not.toMatch(/\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/);
  });

  it('shows the right count on each group header', () => {
    renderPicker();
    const countOf = (group: RegExp) => within(within(list()).getByRole('button', { name: group })).getByText(/^\d+$/).textContent;
    expect(countOf(/Money in and out/)).toBe('3');
    expect(countOf(/Debts/)).toBe('4');
    expect(countOf(/Levies/)).toBe('1');
  });

  it('shows a preview that follows the selected type', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReportTypePicker value="financial_overview" onChange={onChange} config={config} realtimeTypes={REALTIME} accountAgnosticTypes={AGNOSTIC} />
    );
    expect(within(screen.getByTestId('report-type-preview')).queryByText('Debtor')).toBeNull();
    expect(within(screen.getByTestId('report-type-preview')).getByText('Expenses')).toBeTruthy();

    rerender(
      <ReportTypePicker value="debtors_report" onChange={onChange} config={config} realtimeTypes={REALTIME} accountAgnosticTypes={AGNOSTIC} />
    );
    const preview = screen.getByTestId('report-type-preview');
    expect(within(preview).getByText('Debtor')).toBeTruthy();
    expect(within(preview).queryByText('Expenses')).toBeNull();
  });

  it('opens a collapsed group while a search matches in it', () => {
    renderPicker();
    fireEvent.click(within(list()).getByRole('button', { name: /Debts/ }));
    expect(within(list()).queryByRole('button', { name: 'Debtors Report' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Search report types'), { target: { value: 'debtors' } });
    expect(within(list()).getByRole('button', { name: 'Debtors Report' })).toBeTruthy();
  });
});
