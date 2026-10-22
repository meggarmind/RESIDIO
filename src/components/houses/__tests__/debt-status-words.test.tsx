// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { HousePaymentStatus } from '@/components/houses/house-payment-status';
import { CrossPropertyPaymentSummary } from '@/components/residents/cross-property-payment-summary';
import type { DebtStatus } from '@/lib/billing/debt-status';

const mocks = vi.hoisted(() => ({ house: {} as unknown, summary: {} as unknown, resident: {} as unknown }));

vi.mock('next/link', () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/hooks/use-billing', () => ({
  useHousePaymentStatus: () => ({ data: mocks.house, isLoading: false, error: null }),
  useResidentCrossPropertyPaymentSummary: () => ({ data: mocks.summary, isLoading: false, error: null }),
  useResidentIndebtedness: () => ({ data: mocks.resident }),
}));

afterEach(cleanup);

const LABELS: Record<DebtStatus, string> = {
  arrears: 'Arrears',
  outstanding: 'Outstanding',
  paid_in_full: 'Paid in Full',
  credit: 'Credit',
};
const STATUSES = Object.keys(LABELS) as DebtStatus[];
const fields = (status: DebtStatus, label = LABELS[status]) => ({
  debtStatus: status, debtStatusLabel: label, owedInvoiceCount: 0, walletBalance: 0,
});

const housePayload = (status: DebtStatus, residentStatus: DebtStatus, label?: string) => ({
  totalDue: 100, totalPaid: 40, totalOutstanding: 60, invoiceCount: 2, unpaidCount: 1, partiallyPaidCount: 0,
  paidCount: 1, overdueCount: 0, overdueAmount: 0,
  ...fields(status, label),
  residents: [{
    residentId: 'r1', residentName: 'Ada Obi', residentCode: 'R-1', totalDue: 100, totalPaid: 40,
    outstanding: 60, invoiceCount: 2, ...fields(residentStatus),
  }],
});

describe('HousePaymentStatus shows the shared debt status word (#983)', () => {
  it.each(STATUSES)('house panel shows "%s"', (status) => {
    mocks.house = housePayload(status, 'credit');
    render(<HousePaymentStatus houseId="h1" />);
    expect(screen.getAllByText(LABELS[status]).length).toBeGreaterThan(0);
  });

  it.each(STATUSES)('resident row shows "%s"', (status) => {
    mocks.house = housePayload('paid_in_full', status);
    render(<HousePaymentStatus houseId="h1" />);
    fireEvent.click(screen.getByText(/Breakdown by Resident/));
    // the house panel says Paid in Full, so any other word can only come from the resident row
    if (status !== 'paid_in_full') expect(screen.getByText(LABELS[status])).toBeTruthy();
    else expect(screen.getAllByText('Paid in Full')).toHaveLength(2);
  });

  it('shows an edited label, not a hard-coded word', () => {
    mocks.house = housePayload('arrears', 'arrears', 'Seriously behind');
    render(<HousePaymentStatus houseId="h1" />);
    expect(screen.getAllByText('Seriously behind').length).toBeGreaterThan(0);
  });

  it('a fully paid house is not called outstanding even when an amount remains on screen data', () => {
    mocks.house = { ...housePayload('paid_in_full', 'paid_in_full'), totalOutstanding: 5 };
    render(<HousePaymentStatus houseId="h1" />);
    expect(screen.queryByText('Outstanding')).toBeNull();
  });
});

describe('CrossPropertyPaymentSummary shows the shared debt status word (#983)', () => {
  const summary = (status: DebtStatus) => ({
    totalDue: 100, totalPaid: 40, totalOutstanding: 60, totalInvoices: 2,
    properties: [{
      houseId: 'h1', houseNumber: '1', streetName: 'Palm', isCurrentProperty: true, totalDue: 100, totalPaid: 40,
      outstanding: 60, invoiceCount: 2, unpaidCount: 1, overdueCount: 0, ...fields(status),
    }],
  });

  it.each(STATUSES)('property row and resident hero show "%s"', (status) => {
    mocks.summary = summary(status);
    mocks.resident = { ...fields(status) };
    render(<CrossPropertyPaymentSummary residentId="r1" />);
    fireEvent.click(screen.getByText(/Breakdown by Property/));
    // once in the resident hero, once in the property row
    expect(screen.getAllByText(LABELS[status])).toHaveLength(2);
  });
});
