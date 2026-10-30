// @vitest-environment jsdom
// Issue #1362: list-and-preview report picker.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReportTypePicker } from '@/components/reports/report-type-picker';
import { reportTypes } from '@/lib/validators/reports';

afterEach(cleanup);

function setup(value: string = '') {
  const onChange = vi.fn();
  render(
    <ReportTypePicker
      value={value as never}
      onChange={onChange}
      isRealtime={(t) => t === 'debtors_report'}
      isAccountAgnostic={(t) => t === 'debtors_report'}
    />,
  );
  return onChange;
}

describe('ReportTypePicker', () => {
  it('lists all report types, each reachable by click', () => {
    const onChange = setup();
    for (const t of reportTypes) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.label}$`) }));
      expect(onChange).toHaveBeenLastCalledWith(t.value);
    }
    expect(onChange).toHaveBeenCalledTimes(reportTypes.length);
  });

  it('search filters by name and by description', () => {
    setup();
    const box = screen.getByLabelText('Search reports');
    fireEvent.change(box, { target: { value: 'aging' } });
    expect(screen.getByRole('button', { name: 'Invoice Aging Report' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transaction Log' })).toBeNull();
    fireEvent.change(box, { target: { value: 'income, expenses' } });
    expect(screen.getByRole('button', { name: 'Financial Overview' })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'zzzz' } });
    expect(screen.getByText('No report matches your search.')).toBeInTheDocument();
  });

  it('a group header opens and closes its list', () => {
    setup();
    const header = screen.getByRole('button', { name: /Debts \(4\)/ });
    fireEvent.click(header);
    expect(screen.queryByRole('button', { name: 'Debtors Report' })).toBeNull();
    expect(header).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(header);
    expect(screen.getByRole('button', { name: 'Debtors Report' })).toBeInTheDocument();
  });

  it('a search shows its matches even inside a closed group', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Debts \(4\)/ }));
    fireEvent.change(screen.getByLabelText('Search reports'), { target: { value: 'debtors' } });
    expect(screen.getByRole('button', { name: 'Debtors Report' })).toBeInTheDocument();
  });

  it('aim strip follows the selection and labels the preview as an example', () => {
    setup('debtors_report');
    const strip = screen.getByLabelText('What this report asks for');
    expect(within(strip).getByText('As of today')).toBeInTheDocument();
    expect(within(strip).getByText('No bank account step')).toBeInTheDocument();
    expect(within(strip).getByText('Next: Options')).toBeInTheDocument();
    expect(screen.getByText('Example layout')).toBeInTheDocument();
    expect(within(screen.getByTestId('example-layout-table')).getByText('Over 90d')).toBeInTheDocument();
  });

  it('a dated, bank-aware report asks for both', () => {
    setup('transaction_log');
    expect(screen.getByText('Asks for a date range')).toBeInTheDocument();
    expect(screen.getByText('Asks for bank accounts')).toBeInTheDocument();
    expect(screen.getByText('Next: Time Period')).toBeInTheDocument();
  });
});
