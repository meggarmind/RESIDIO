// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PilotResidentsTable } from '@/app/(dashboard)/settings/whatsapp/pilot-residents-table';
import type { PilotRosterResident } from '@/lib/whatsapp/pilot-roster';

const ROSTER: PilotRosterResident[] = [
  { id: 'res-1', name: 'Ada Okoro', code: 'RES001', houses: [{ label: '12 Palm Close', streetId: 'st-palm', role: 'Owner-Occupier' }], optIn: 'opted_in', phone: '+234****567' },
  { id: 'res-2', name: 'Bola Bello', code: 'RES002', houses: [{ label: 'Flat 1 Pilot Close', streetId: 'st-pilot', role: 'Renter' }], optIn: 'none', phone: null },
  { id: 'res-3', name: 'Chidi Eze', code: 'RES003', houses: [{ label: '4 Oak Lane', streetId: 'st-oak', role: 'Renter' }], optIn: 'opted_out', phone: '+234****111' },
];
const STREETS = [{ id: 'st-pilot', name: 'Pilot Close' }, { id: 'st-palm', name: 'Palm Close' }];

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(() => cleanup());

function renderTable(overrides: Partial<Parameters<typeof PilotResidentsTable>[0]> = {}) {
  const props = { roster: ROSTER, streets: STREETS, residentIds: ['res-1'], onResidentIdsChange: vi.fn(), streetId: 'st-pilot', onStreetIdChange: vi.fn(), ...overrides };
  render(<PilotResidentsTable {...props} />);
  return props;
}

describe('PilotResidentsTable (#801)', () => {
  it('lists chosen residents and street members with house, role, number and consent', () => {
    renderTable();
    expect(screen.getByText('Ada Okoro')).toBeInTheDocument();
    expect(screen.getByText('Bola Bello')).toBeInTheDocument();
    expect(screen.queryByText('Chidi Eze')).not.toBeInTheDocument();
    expect(screen.getByText('+234****567')).toBeInTheDocument();
    expect(screen.getByText('No consent')).toBeInTheDocument();
    expect(screen.getByTestId('pilot-summary')).toHaveTextContent('2 in pilot: 1 chosen by name, 1 more from Pilot Close. 1 opted in.');
  });

  it('removes a chosen resident, and gives no remove button to a street member', () => {
    const props = renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada Okoro' }));
    expect(props.onResidentIdsChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole('button', { name: 'Remove Bola Bello' })).not.toBeInTheDocument();
  });

  it('searches by house and filters to residents not opted in', () => {
    renderTable();
    fireEvent.change(screen.getByLabelText('Search pilot residents'), { target: { value: 'palm' } });
    expect(screen.getByText('Ada Okoro')).toBeInTheDocument();
    expect(screen.queryByText('Bola Bello')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search pilot residents'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter pilot residents'), { target: { value: 'not_opted_in' } });
    expect(screen.queryByText('Ada Okoro')).not.toBeInTheDocument();
    expect(screen.getByText('Bola Bello')).toBeInTheDocument();
  });

  it('chooses the pilot street by name', () => {
    const props = renderTable({ streetId: '' });
    fireEvent.change(screen.getByLabelText(/Pilot street/), { target: { value: 'st-palm' } });
    expect(props.onStreetIdChange).toHaveBeenCalledWith('st-palm');
  });

  it('shows a saved ID that is not in the roster as unknown, and hides remove when read-only', () => {
    renderTable({ residentIds: ['deadbeef-0000'], streetId: '', disabled: true });
    expect(screen.getByText('Unknown resident (deadbeef)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });
});
